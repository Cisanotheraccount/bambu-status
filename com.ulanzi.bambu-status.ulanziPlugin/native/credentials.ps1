$ErrorActionPreference = 'Stop'
try {
    $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($request.id -notmatch '^[a-f0-9]{16}$') { throw 'Invalid ID' }
    $directory = Join-Path $request.baseDir 'credentials'
    $null = New-Item -ItemType Directory -Force -Path $directory
    $file = Join-Path $directory ($request.id + '.dpapi')
    switch ($request.operation) {
        'set' {
            $secure = ConvertTo-SecureString $request.secret -AsPlainText -Force
            $encrypted = ConvertFrom-SecureString $secure
            [IO.File]::WriteAllText($file, $encrypted)
            $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
            $acl = New-Object Security.AccessControl.FileSecurity
            $acl.SetAccessRuleProtection($true, $false)
            $rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, 'FullControl', 'Allow')
            $acl.AddAccessRule($rule)
            Set-Acl -Path $file -AclObject $acl
            [Console]::Out.Write('{"status":"saved"}')
        }
        'get' {
            $secret = ''
            if (Test-Path $file) {
                $secure = ConvertTo-SecureString ([IO.File]::ReadAllText($file))
                $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
                try { $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
                finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
            }
            [Console]::Out.Write((@{secret=$secret} | ConvertTo-Json -Compress))
        }
        'delete' { if (Test-Path $file) { Remove-Item $file }; [Console]::Out.Write('{"status":"deleted"}') }
        default { throw 'Invalid operation' }
    }
} catch {
    $line = $_.InvocationInfo.ScriptLineNumber
    $kind = $_.Exception.GetType().Name
    [Console]::Error.Write("Credential storage failed: $kind at line $line")
    exit 2
}
