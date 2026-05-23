import { encrypt, decrypt } from './cipher.js';

const testCases = [
    'hello',
    'hi',
    'secure communication',
    'secom app',
    'testing the matrix multiplication mod twenty seven'
];

console.log('--- Testing SeCom Cipher ---');
for (let text of testCases) {
    console.log(`Original:  "${text}"`);
    const { ciphertext, steps } = encrypt(text);
    console.log(`Encrypted (Binary): ${ciphertext}`);
    const decrypted = decrypt(ciphertext);
    console.log(`Decrypted: "${decrypted}"`);
    console.log(`Success:   ${text.trim() === decrypted.trim() ? '✅ YES' : '❌ NO'}`);
    console.log('----------------------------');
}
