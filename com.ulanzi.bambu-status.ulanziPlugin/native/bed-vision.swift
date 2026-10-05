import CoreGraphics
import Foundation
import ImageIO
import Vision

struct Arguments {
    var current = ""
    var empty: [String] = []
    var occupied: [String] = []
}

struct MatchResult: Codable {
    let available: Bool
    let emptyDistance: Float?
    let occupiedDistance: Float?
    let emptyReference: String?
    let occupiedReference: String?
    let region: String
}

func parseArguments(_ values: [String]) -> Arguments {
    var result = Arguments()
    var index = 0
    while index < values.count {
        let flag = values[index]
        guard index + 1 < values.count else { break }
        let value = values[index + 1]
        switch flag {
        case "--current":
            result.current = value
        case "--empty":
            result.empty.append(value)
        case "--occupied":
            result.occupied.append(value)
        default:
            index -= 1
        }
        index += 2
    }
    return result
}

func featurePrint(path: String) throws -> VNFeaturePrintObservation {
    let url = URL(fileURLWithPath: path) as CFURL
    guard
        let source = CGImageSourceCreateWithURL(url, nil),
        let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
    else {
        throw NSError(domain: "BambuBedVision", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Unable to decode image"
        ])
    }

    let request = VNGenerateImageFeaturePrintRequest()
    // The moving build plate and printed part occupy the lower two-thirds.
    // Cropping out most of the fixed enclosure makes the feature distance
    // respond to the bed instead of the printer shell.
    request.regionOfInterest = CGRect(x: 0.08, y: 0.0, width: 0.84, height: 0.68)
    try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
    guard let observation = request.results?.first as? VNFeaturePrintObservation else {
        throw NSError(domain: "BambuBedVision", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "No feature print returned"
        ])
    }
    return observation
}

func closestMatch(
    current: VNFeaturePrintObservation,
    paths: [String]
) -> (distance: Float, path: String)? {
    var best: (distance: Float, path: String)?
    for path in paths {
        guard let candidate = try? featurePrint(path: path) else { continue }
        var distance: Float = 0
        guard (try? current.computeDistance(&distance, to: candidate)) != nil else { continue }
        if best == nil || distance < best!.distance {
            best = (distance, path)
        }
    }
    return best
}

let arguments = parseArguments(Array(CommandLine.arguments.dropFirst()))
guard !arguments.current.isEmpty, !arguments.empty.isEmpty else {
    FileHandle.standardError.write(Data("Missing current or empty reference image\n".utf8))
    exit(2)
}

do {
    let current = try featurePrint(path: arguments.current)
    let emptyMatch = closestMatch(current: current, paths: arguments.empty)
    let occupiedMatch = closestMatch(current: current, paths: arguments.occupied)
    let result = MatchResult(
        available: emptyMatch != nil,
        emptyDistance: emptyMatch?.distance,
        occupiedDistance: occupiedMatch?.distance,
        emptyReference: emptyMatch?.path,
        occupiedReference: occupiedMatch?.path,
        region: "lower-bed"
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    FileHandle.standardOutput.write(try encoder.encode(result))
    FileHandle.standardOutput.write(Data("\n".utf8))
} catch {
    FileHandle.standardError.write(Data("Vision feature extraction failed\n".utf8))
    exit(1)
}
