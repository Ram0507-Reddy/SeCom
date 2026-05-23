/**
 * SeCom Cipher Engine
 * Custom symmetric, layered encryption/decryption:
 * Plaintext -> 1. Atbash -> 2. Alphabetical Number Mapping (0-26) -> 3. Mod-27 Hill Cipher (2x2 Matrix) -> 4. Morse Code -> 5. Binary
 */

// Alphabet size and mappings
const ALPHABET = ' abcdefghijklmnopqrstuvwxyz'; // space = 0, a = 1, b = 2, ..., z = 26
const ALPHABET_SIZE = 27;

// Default invertible matrix key: K = [[3, 4], [2, 3]]
// det(K) = 3*3 - 4*2 = 1. Since det(K) = 1, it is always invertible modulo 27.
const DEFAULT_KEY = [[3, 4], [2, 3]];

// Inverse key matrix: K^-1 = [[3, 23], [25, 3]] mod 27
// [3, -4] -> [3, 23]
// [-2, 3] -> [25, 3]
const DEFAULT_KEY_INV = [[3, 23], [25, 3]];

// Morse code mapping
const CHAR_TO_MORSE = {
    ' ': '/',
    'a': '.-',     'b': '-...',   'c': '-.-.',   'd': '-..',    'e': '.',
    'f': '..-.',   'g': '--.',    'h': '....',   'i': '..',     'j': '.---',
    'k': '-.-',    'l': '.-..',   'm': '--',     'n': '-.',     'o': '---',
    'p': '.--.',   'q': '--.-',   'r': '.-.',    's': '...',    't': '-',
    'u': '..-',    'v': '...-',   'w': '.--',    'x': '-..-',   'y': '-.--',
    'z': '--..'
};

const MORSE_TO_CHAR = Object.fromEntries(
    Object.entries(CHAR_TO_MORSE).map(([char, morse]) => [morse, char])
);

// 2-bit Binary Encoding for Morse symbols
// . -> 00, - -> 01, ' ' -> 10, / -> 11
const BINARY_MAP = {
    '.': '00',
    '-': '01',
    ' ': '10',
    '/': '11'
};

const REVERSE_BINARY_MAP = {
    '00': '.',
    '01': '-',
    '10': ' ',
    '11': '/'
};

/**
 * Sanitize and pad plaintext input to be compatible with mod-27 and 2x2 matrix blocks.
 * Keeps only a-z and spaces, converting to lowercase.
 */
function sanitizeInput(text) {
    if (!text) return '';
    let sanitized = text.toLowerCase()
        .replace(/[^a-z\s]/g, '') // Keep only letters and spaces
        .replace(/\s+/g, ' ');   // Collapse multiple spaces to single space
    
    // Pad to even length for 2x2 matrix
    if (sanitized.length % 2 !== 0) {
        sanitized += ' ';
    }
    return sanitized;
}

/**
 * Character to Number (Combined Atbash + Number mapping)
 * a -> 1, b -> 2, ..., z -> 26, space -> 0
 */
function charToNum(char) {
    const idx = ALPHABET.indexOf(char);
    return idx === -1 ? 0 : idx;
}

/**
 * Number to Character mapping
 * 0 -> space, 1 -> a, 2 -> b, ..., 26 -> z
 */
function numToChar(num) {
    // Handle modular negatives and bounds
    const normalized = ((num % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE;
    return ALPHABET.charAt(normalized);
}

/**
 * Matrix multiplication modulo 27 for a 2D vector
 */
function multiplyVector(matrix, vector) {
    const y0 = matrix[0][0] * vector[0] + matrix[0][1] * vector[1];
    const y1 = matrix[1][0] * vector[0] + matrix[1][1] * vector[1];
    return [
        ((y0 % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE,
        ((y1 % ALPHABET_SIZE) + ALPHABET_SIZE) % ALPHABET_SIZE
    ];
}

/**
 * Encrypt a text message
 * @param {string} plaintext - The message to encrypt
 * @param {Array<Array<number>>} [key] - 2x2 matrix key
 * @returns {object} - Encrypted binary string and steps for visualization
 */
export function encrypt(plaintext, key = DEFAULT_KEY) {
    const steps = [];
    const sanitized = sanitizeInput(plaintext);
    steps.push({ label: 'Sanitized & Padded Input', value: sanitized });

    // Step 1 & 2: Atbash & Number mapping
    const numbers = [];
    for (let char of sanitized) {
        numbers.push(charToNum(char));
    }
    steps.push({ label: 'Atbash & Number Mapping', value: numbers.join(', ') });

    // Step 3: Hill Cipher Matrix Multiplication
    const encryptedNumbers = [];
    for (let i = 0; i < numbers.length; i += 2) {
        const block = [numbers[i], numbers[i + 1]];
        const encryptedBlock = multiplyVector(key, block);
        encryptedNumbers.push(...encryptedBlock);
    }
    steps.push({ label: 'Matrix Encryption (Mod-27)', value: encryptedNumbers.join(', ') });

    // Step 4: Convert back to intermediate characters
    const cipherChars = encryptedNumbers.map(numToChar);
    steps.push({ label: 'Intermediate Characters', value: cipherChars.join('') });

    // Step 5: Convert intermediate characters to Morse code
    const morseParts = [];
    for (let char of cipherChars) {
        if (CHAR_TO_MORSE[char]) {
            morseParts.push(CHAR_TO_MORSE[char]);
        }
    }
    const morseString = morseParts.join(' ');
    steps.push({ label: 'Morse Code Representation', value: morseString });

    // Step 6: Convert Morse to 2-bit binary
    let binaryString = '';
    for (let char of morseString) {
        if (BINARY_MAP[char]) {
            binaryString += BINARY_MAP[char];
        }
    }
    steps.push({ label: 'Final Binary Encrypted String', value: binaryString });

    return {
        ciphertext: binaryString,
        steps: steps
    };
}

/**
 * Decrypt a binary message
 * @param {string} binaryString - The binary string to decrypt
 * @param {Array<Array<number>>} [keyInv] - Inverse 2x2 matrix key
 * @returns {string} - Decrypted plaintext message
 */
export function decrypt(binaryString, keyInv = DEFAULT_KEY_INV) {
    if (!binaryString || binaryString.length % 2 !== 0) {
        return '';
    }

    // Step 1: Decode 2-bit binary to Morse code
    let morseString = '';
    for (let i = 0; i < binaryString.length; i += 2) {
        const bitPair = binaryString.substring(i, i + 2);
        if (REVERSE_BINARY_MAP[bitPair]) {
            morseString += REVERSE_BINARY_MAP[bitPair];
        }
    }

    // Step 2: Convert Morse code back to intermediate characters
    // Morse letters are separated by spaces, words are separated by '/'
    // Let's parse the morse string
    const morseSymbols = morseString.split(' ');
    const cipherChars = [];
    for (let symbol of morseSymbols) {
        if (MORSE_TO_CHAR[symbol]) {
            cipherChars.push(MORSE_TO_CHAR[symbol]);
        } else if (symbol === '') {
            // Handle edge case of multiple spaces if any
            continue;
        }
    }

    // Step 3: Convert intermediate characters to numbers
    const encryptedNumbers = cipherChars.map(charToNum);
    if (encryptedNumbers.length % 2 !== 0) {
        // Fallback for corrupt block sizes
        encryptedNumbers.push(0);
    }

    // Step 4: Multiply by inverse key matrix (Mod-27 Hill Cipher Decryption)
    const decryptedNumbers = [];
    for (let i = 0; i < encryptedNumbers.length; i += 2) {
        const block = [encryptedNumbers[i], encryptedNumbers[i + 1]];
        const decryptedBlock = multiplyVector(keyInv, block);
        decryptedNumbers.push(...decryptedBlock);
    }

    // Step 5: Convert numbers back to original plaintext characters
    const plaintextChars = decryptedNumbers.map(numToChar);
    
    // Trim trailing spaces that might have been added for padding
    return plaintextChars.join('').trimEnd();
}
