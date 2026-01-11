# Test script for /api/whatsapp/message endpoint (PowerShell)
# This simulates a real WhatsApp message from n8n

$Port = if ($env:PORT) { $env:PORT } else { 3001 }
$BaseUrl = "http://localhost:$Port"

Write-Host "Testing /api/whatsapp/message endpoint..."
Write-Host ""

# Test with a real WhatsApp message format
$body = @{
    sessionId = "919876543210"
    message = "Hello, I want to know more about PROXe"
    profileName = "John Doe"
    timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
    brand = "proxe"
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "$BaseUrl/api/whatsapp/message" `
        -Method POST `
        -ContentType "application/json" `
        -Body $body
    
    Write-Host "Response:"
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "Error: $_"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody"
    }
}

Write-Host ""
Write-Host "Check the console logs for detailed debugging information"
Write-Host "Look for '=== addToHistory DEBUG ===' sections"

