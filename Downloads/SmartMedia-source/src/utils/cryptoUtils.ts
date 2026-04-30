/**
 * SmartMedia Crypto Utilities
 * Enterprise-grade encryption for Private Vault
 * Uses Web Crypto API for AES-256-GCM encryption
 */

// Generate a random salt for key derivation
export function generateSalt(): string {
    const array = new Uint8Array(16)
    crypto.getRandomValues(array)
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

// Generate a random IV for encryption
export function generateIV(): Uint8Array {
    const iv = new Uint8Array(12) // 96 bits for GCM
    crypto.getRandomValues(iv)
    return iv
}

// Convert hex string to Uint8Array
export function hexToBytes(hex: string): Uint8Array {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
        bytes[i / 2] = parseInt(hex.substr(i, 2), 16)
    }
    return bytes
}

// Convert Uint8Array to hex string
export function bytesToHex(bytes: Uint8Array): string {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// Derive an AES-256 key from password using PBKDF2
export async function deriveKey(password: string, salt: string): Promise<CryptoKey> {
    const encoder = new TextEncoder()
    const passwordBuffer = encoder.encode(password)
    const saltBuffer = hexToBytes(salt)

    // Import password as key material
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        passwordBuffer,
        'PBKDF2',
        false,
        ['deriveKey']
    )

    // Derive AES-256-GCM key
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: 100000, // High iteration count for security
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    )
}

// Hash PIN using SHA-256 (for storage comparison)
export async function hashPin(pin: string, salt: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(pin + salt)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return bytesToHex(new Uint8Array(hashBuffer))
}

// Verify PIN against stored hash
export async function verifyPin(pin: string, salt: string, storedHash: string): Promise<boolean> {
    const hash = await hashPin(pin, salt)
    return hash === storedHash
}

// Generate a recovery key (24 words simulated as hex)
export function generateRecoveryKey(): string {
    const array = new Uint8Array(32) // 256 bits
    crypto.getRandomValues(array)
    // Format as groups of 4 characters separated by dashes
    const hex = bytesToHex(array)
    return hex.match(/.{1,4}/g)?.join('-') || hex
}

// Encrypt data using AES-256-GCM
export async function encryptData(data: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
    return crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    )
}

// Decrypt data using AES-256-GCM
export async function decryptData(encryptedData: ArrayBuffer, key: CryptoKey, iv: Uint8Array): Promise<ArrayBuffer> {
    return crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        encryptedData
    )
}

// Encrypt a file (returns base64 encoded string with IV prepended)
export async function encryptFile(fileData: ArrayBuffer, password: string, salt: string): Promise<string> {
    const key = await deriveKey(password, salt)
    const iv = generateIV()
    const encrypted = await encryptData(fileData, key, iv)

    // Combine IV + encrypted data
    const combined = new Uint8Array(iv.length + encrypted.byteLength)
    combined.set(iv, 0)
    combined.set(new Uint8Array(encrypted), iv.length)

    // Convert to base64 for storage
    return btoa(String.fromCharCode(...combined))
}

// Decrypt a file (expects base64 encoded string with IV prepended)
export async function decryptFile(encryptedBase64: string, password: string, salt: string): Promise<ArrayBuffer> {
    const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))

    // Extract IV (first 12 bytes) and encrypted data
    const iv = combined.slice(0, 12)
    const encryptedData = combined.slice(12)

    const key = await deriveKey(password, salt)
    return decryptData(encryptedData.buffer, key, iv)
}

// Simple obfuscation for PIN storage (not encryption, just encoding)
export function obfuscatePin(pin: string): string {
    return btoa(pin.split('').reverse().join(''))
}

export function deobfuscatePin(obfuscated: string): string {
    try {
        return atob(obfuscated).split('').reverse().join('')
    } catch {
        return obfuscated // Return as-is if decoding fails
    }
}

// Session token generation
export function generateSessionToken(): string {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    return bytesToHex(array)
}

// Calculate time until lockout expires
export function getLockoutTimeRemaining(lockedUntil: string | undefined): number {
    if (!lockedUntil) return 0
    const remaining = new Date(lockedUntil).getTime() - Date.now()
    return Math.max(0, Math.ceil(remaining / 60000)) // Return minutes
}

// Check if currently locked out
export function isCurrentlyLockedOut(lockedUntil: string | undefined): boolean {
    if (!lockedUntil) return false
    return new Date(lockedUntil) > new Date()
}

// Audit log entry type
export interface AuditLogEntry {
    timestamp: string
    action: 'unlock' | 'lock' | 'failed_attempt' | 'intruder' | 'settings_change' | 'photo_added' | 'photo_removed'
    details?: string
    ipAddress?: string
}

// Create audit log entry
export function createAuditEntry(
    action: AuditLogEntry['action'],
    details?: string
): AuditLogEntry {
    return {
        timestamp: new Date().toISOString(),
        action,
        details
    }
}

// Format recovery key for display (with dashes)
export function formatRecoveryKey(key: string): string {
    return key.replace(/-/g, '').match(/.{1,4}/g)?.join('-') || key
}

// Validate recovery key format
export function isValidRecoveryKey(key: string): boolean {
    const cleanKey = key.replace(/-/g, '')
    return /^[0-9a-f]{64}$/i.test(cleanKey)
}

// Generate intruder photo filename
export function generateIntruderPhotoName(): string {
    const now = new Date()
    return `intruder_${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}_${now.getHours().toString().padStart(2, '0')}${now.getMinutes().toString().padStart(2, '0')}${now.getSeconds().toString().padStart(2, '0')}.jpg`
}

// Password strength checker
export function checkPinStrength(pin: string): { score: number; label: string; color: string } {
    let score = 0

    // Length check
    if (pin.length >= 4) score += 1
    if (pin.length >= 6) score += 1
    if (pin.length >= 8) score += 1

    // Complexity checks
    const hasSequential = /(?:012|123|234|345|456|567|678|789|890)/.test(pin)
    const hasRepeating = /(.)\1{2,}/.test(pin)
    const allSameDigit = /^(.)\1*$/.test(pin)

    if (!hasSequential) score += 1
    if (!hasRepeating) score += 1
    if (!allSameDigit) score += 1

    // Normalize to 0-100
    const normalizedScore = Math.min(100, (score / 6) * 100)

    if (normalizedScore < 33) {
        return { score: normalizedScore, label: 'Weak', color: 'red' }
    } else if (normalizedScore < 66) {
        return { score: normalizedScore, label: 'Medium', color: 'yellow' }
    } else {
        return { score: normalizedScore, label: 'Strong', color: 'green' }
    }
}

export default {
    generateSalt,
    generateIV,
    deriveKey,
    hashPin,
    verifyPin,
    generateRecoveryKey,
    encryptData,
    decryptData,
    encryptFile,
    decryptFile,
    obfuscatePin,
    deobfuscatePin,
    generateSessionToken,
    getLockoutTimeRemaining,
    isCurrentlyLockedOut,
    createAuditEntry,
    formatRecoveryKey,
    isValidRecoveryKey,
    generateIntruderPhotoName,
    checkPinStrength
}
