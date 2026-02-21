"""
AES Encryption Module - Fineract-compliant
Implements AES-256-CBC for sensitive data encryption at rest
"""
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend
import base64
import os
import hashlib
from typing import Optional

from app.config import settings


class AESEncryption:
    """
    AES-256 Encryption for sensitive data at rest
    Uses AES/CBC/PKCS5Padding (same as Fineract)
    """
    
    # AES-256 requires 32-byte key
    KEY_SIZE = 32
    BLOCK_SIZE = 16  # AES block size
    
    def __init__(self, master_key: Optional[str] = None):
        """
        Initialize with master key
        If no key provided, uses settings.ENCRYPTION_KEY
        """
        key = master_key or getattr(settings, 'ENCRYPTION_KEY', None)
        if not key:
            # Generate a key from SECRET_KEY for development
            # In production, this should be a separate, strong key
            key = hashlib.sha256(settings.SECRET_KEY.encode()).hexdigest()[:32]
        
        # Ensure key is exactly 32 bytes
        self.key = key.encode()[:self.KEY_SIZE].ljust(self.KEY_SIZE, b'\0')
    
    def encrypt(self, plaintext: str) -> str:
        """
        Encrypt plaintext using AES-256-CBC
        Returns base64-encoded ciphertext with IV prepended
        """
        if not plaintext:
            return ""
        
        # Generate random IV (16 bytes for AES)
        iv = os.urandom(self.BLOCK_SIZE)
        
        # Create cipher
        cipher = Cipher(
            algorithms.AES(self.key),
            modes.CBC(iv),
            backend=default_backend()
        )
        encryptor = cipher.encryptor()
        
        # Pad the plaintext (PKCS7/PKCS5 padding)
        padder = padding.PKCS7(self.BLOCK_SIZE * 8).padder()
        padded_data = padder.update(plaintext.encode('utf-8')) + padder.finalize()
        
        # Encrypt
        ciphertext = encryptor.update(padded_data) + encryptor.finalize()
        
        # Combine IV + ciphertext and encode to base64
        encrypted = base64.b64encode(iv + ciphertext).decode('utf-8')
        
        return encrypted
    
    def decrypt(self, encrypted: str) -> str:
        """
        Decrypt ciphertext using AES-256-CBC
        Expects base64-encoded ciphertext with IV prepended
        """
        if not encrypted:
            return ""
        
        try:
            # Decode from base64
            encrypted_bytes = base64.b64decode(encrypted)
            
            # Extract IV (first 16 bytes)
            iv = encrypted_bytes[:self.BLOCK_SIZE]
            ciphertext = encrypted_bytes[self.BLOCK_SIZE:]
            
            # Create cipher
            cipher = Cipher(
                algorithms.AES(self.key),
                modes.CBC(iv),
                backend=default_backend()
            )
            decryptor = cipher.decryptor()
            
            # Decrypt
            padded_plaintext = decryptor.update(ciphertext) + decryptor.finalize()
            
            # Unpad
            unpadder = padding.PKCS7(self.BLOCK_SIZE * 8).unpadder()
            plaintext = unpadder.update(padded_plaintext) + unpadder.finalize()
            
            return plaintext.decode('utf-8')
        
        except Exception as e:
            # Log error but don't expose details
            raise ValueError("Decryption failed") from e
    
    def encrypt_field(self, value: Optional[str]) -> Optional[str]:
        """Helper to encrypt a field, handling None values"""
        if value is None:
            return None
        return self.encrypt(value)
    
    def decrypt_field(self, value: Optional[str]) -> Optional[str]:
        """Helper to decrypt a field, handling None values"""
        if value is None:
            return None
        return self.decrypt(value)


class FieldEncryption:
    """
    Field-level encryption for database columns
    Encrypts sensitive PII fields
    """
    
    def __init__(self):
        self.encryption = AESEncryption()
    
    # Fields that should be encrypted
    SENSITIVE_FIELDS = [
        'national_id',
        'phone_primary',
        'phone_secondary',
        'email',
        'address',
        'next_of_kin_phone',
        'fingerprint_template'
    ]
    
    def encrypt_dict(self, data: dict, fields: Optional[list] = None) -> dict:
        """Encrypt specified fields in a dictionary"""
        if fields is None:
            fields = self.SENSITIVE_FIELDS
        
        encrypted = data.copy()
        for field in fields:
            if field in encrypted and encrypted[field]:
                encrypted[field] = self.encryption.encrypt(str(encrypted[field]))
        
        return encrypted
    
    def decrypt_dict(self, data: dict, fields: Optional[list] = None) -> dict:
        """Decrypt specified fields in a dictionary"""
        if fields is None:
            fields = self.SENSITIVE_FIELDS
        
        decrypted = data.copy()
        for field in fields:
            if field in decrypted and decrypted[field]:
                try:
                    decrypted[field] = self.encryption.decrypt(str(decrypted[field]))
                except ValueError:
                    # Field might not be encrypted, leave as is
                    pass
        
        return decrypted


# Global encryption instance
field_encryption = FieldEncryption()


def encrypt_sensitive_data(value: str) -> str:
    """Utility function to encrypt a value"""
    return field_encryption.encryption.encrypt(value)


def decrypt_sensitive_data(value: str) -> str:
    """Utility function to decrypt a value"""
    return field_encryption.encryption.decrypt(value)