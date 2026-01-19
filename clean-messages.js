/**
 * Script to clean existing message log files
 * Removes duplicates and empty messages
 * 
 * Usage: node clean-messages.js <input-file> [output-file]
 */

const fs = require('fs');
const path = require('path');

/**
 * Check if a message is empty or contains minimal data
 */
function isEmptyMessage(data) {
  if (data === null || data === undefined) return true;
  
  // Simple primitive values (numbers, strings) are considered empty
  if (typeof data !== 'object') return true;
  
  // Empty objects
  if (Object.keys(data).length === 0) return true;
  
  // Check for minimal data structures that don't contain useful info
  // Messages with just a number (like { data: 2 }) are empty
  if (Object.keys(data).length === 1 && typeof data.data === 'number') {
    return true;
  }
  
  return false;
}

/**
 * Generate a unique key for a message type to identify duplicates
 */
function getMessageTypeKey(data) {
  if (!data || typeof data !== 'object') {
    return `primitive_${typeof data}_${data}`;
  }
  
  // Handle messages with type property (like "Connected", "SessionEstablished")
  if (data.type && typeof data.type === 'string') {
    return `type_string_${data.type}`;
  }
  
  // Handle messages with id and data.type structure
  if (data.id !== undefined && data.data && data.data.type !== undefined) {
    const id = data.id;
    const type = data.data.type;
    // Include payload structure if it exists
    const hasPayload = data.data.payload !== undefined && data.data.payload !== null;
    const payloadKeys = hasPayload && typeof data.data.payload === 'object' && !Array.isArray(data.data.payload)
      ? Object.keys(data.data.payload).sort().join(',')
      : (hasPayload && Array.isArray(data.data.payload) ? 'array' : 'no_payload');
    return `id_${id}_type_${type}_payload_${payloadKeys}`;
  }
  
  // Handle messages with just id
  if (data.id !== undefined) {
    return `id_only_${data.id}`;
  }
  
  // Handle messages with type number (in data.data.type)
  if (data.data && typeof data.data === 'object' && data.data.type !== undefined) {
    return `nested_type_${data.data.type}`;
  }
  
  // Fallback: use structure signature
  try {
    const keys = Object.keys(data).sort();
    const structure = keys.map(k => {
      const val = data[k];
      if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
        try {
          return `${k}:${Object.keys(val).sort().join(',')}`;
        } catch (e) {
          return `${k}:${typeof val}`;
        }
      }
      return `${k}:${typeof val}`;
    }).join('|');
    
    return `structure_${structure}`;
  } catch (e) {
    // Ultimate fallback
    return `fallback_${JSON.stringify(data).substring(0, 100)}`;
  }
}

/**
 * Deduplicate an array of messages, keeping only the first occurrence of each type
 */
function deduplicateMessages(messages) {
  const seen = new Set();
  const deduplicated = [];
  
  for (const msg of messages) {
    try {
      const data = msg.data !== undefined ? msg.data : msg;
      
      // Skip empty messages
      if (isEmptyMessage(data)) {
        continue;
      }
      
      // Generate type key
      const typeKey = getMessageTypeKey(data);
      
      // Only keep first occurrence
      if (!seen.has(typeKey)) {
        seen.add(typeKey);
        deduplicated.push(msg);
      }
    } catch (e) {
      console.warn('Error processing message:', e.message, msg);
      // Skip problematic messages
      continue;
    }
  }
  
  return deduplicated;
}

// Main execution
const inputFile = process.argv[2];
if (!inputFile) {
  console.error('Usage: node clean-messages.js <input-file> [output-file]>');
  process.exit(1);
}

const outputFile = process.argv[3] || inputFile.replace(/\.json$/, '-cleaned.json');

try {
  console.log(`Reading ${inputFile}...`);
  const fileContent = fs.readFileSync(inputFile, 'utf8');
  const data = JSON.parse(fileContent);
  
  const originalCount = data.messages ? data.messages.length : 0;
  console.log(`Original message count: ${originalCount}`);
  
  if (!data.messages || !Array.isArray(data.messages)) {
    console.error('Invalid file format: messages array not found');
    process.exit(1);
  }
  
  // Deduplicate messages
  const cleanedMessages = deduplicateMessages(data.messages);
  console.log(`Cleaned message count: ${cleanedMessages.length}`);
  console.log(`Removed: ${originalCount - cleanedMessages.length} messages (${((originalCount - cleanedMessages.length) / originalCount * 100).toFixed(1)}%)`);
  
  // Create cleaned data structure
  const cleanedData = {
    ...data,
    messageCount: cleanedMessages.length,
    originalCount: originalCount,
    messages: cleanedMessages
  };
  
  // Write output
  console.log(`Writing to ${outputFile}...`);
  fs.writeFileSync(outputFile, JSON.stringify(cleanedData, null, 2), 'utf8');
  
  console.log(`✅ Successfully cleaned file!`);
  console.log(`   Original: ${originalCount} messages`);
  console.log(`   Cleaned: ${cleanedMessages.length} messages`);
  console.log(`   Removed: ${originalCount - cleanedMessages.length} messages`);
  
} catch (error) {
  console.error('Error processing file:', error.message);
  process.exit(1);
}
