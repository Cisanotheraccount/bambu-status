import Foundation
import Security

struct Request: Decodable { let operation: String; let id: String; let secret: String? }
func output(_ value: [String: String]) throws {
    FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: value))
}
do {
    let request = try JSONDecoder().decode(Request.self, from: FileHandle.standardInput.readDataToEndOfFile())
    guard request.id.range(of: "^[a-f0-9]{16}$", options: .regularExpression) != nil else { exit(2) }
    let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: "com.ulanzi.ulanzistudio.bambustatus",
        kSecAttrAccount as String: request.id]
    switch request.operation {
    case "set":
        let value = Data((request.secret ?? "").utf8)
        let status = SecItemUpdate(query as CFDictionary, [kSecValueData as String: value] as CFDictionary)
        if status == errSecItemNotFound {
            var insert = query
            insert[kSecValueData as String] = value
            guard SecItemAdd(insert as CFDictionary, nil) == errSecSuccess else { exit(3) }
        } else if status != errSecSuccess { exit(3) }
        try output(["status": "saved"])
    case "get":
        var lookup = query
        lookup[kSecReturnData as String] = true
        lookup[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(lookup as CFDictionary, &result)
        if status == errSecItemNotFound { try output(["secret": ""]) }
        else {
            guard status == errSecSuccess, let data = result as? Data else { exit(3) }
            try output(["secret": String(data: data, encoding: .utf8) ?? ""])
        }
    case "delete":
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { exit(3) }
        try output(["status": "deleted"])
    default: exit(2)
    }
} catch { exit(2) }
