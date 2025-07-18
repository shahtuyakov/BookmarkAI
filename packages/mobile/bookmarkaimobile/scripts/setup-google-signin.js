#!/usr/bin/env node

/**
 * Pre-build script to configure Google Sign-In URL scheme
 * This reads from .env file and updates Info.plist
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Load environment variables from .env file
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.warn('⚠️  .env file not found');
    return {};
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = {};
  
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=');
      if (key && valueParts.length > 0) {
        env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  });
  
  return env;
}

async function updateInfoPlist() {
  const env = loadEnvFile();
  const googleClientId = env.GOOGLE_IOS_CLIENT_ID || process.env.GOOGLE_IOS_CLIENT_ID;
  
  if (!googleClientId) {
    console.error('❌ GOOGLE_IOS_CLIENT_ID not found in .env file or environment');
    console.log('Please add GOOGLE_IOS_CLIENT_ID to your .env file');
    process.exit(1);
  }

  // Check if it's already a full URL scheme or just the client ID
  let fullUrlScheme;
  if (googleClientId.startsWith('com.googleusercontent.apps.')) {
    fullUrlScheme = googleClientId;
  } else if (googleClientId.includes('.apps.googleusercontent.com')) {
    // It's in the format: CLIENT_ID.apps.googleusercontent.com
    const clientIdOnly = googleClientId.replace('.apps.googleusercontent.com', '');
    fullUrlScheme = `com.googleusercontent.apps.${clientIdOnly}`;
  } else {
    // It's just the client ID
    fullUrlScheme = `com.googleusercontent.apps.${googleClientId}`;
  }

  const infoPlistPath = path.join(__dirname, '..', 'ios', 'BookmarkAI', 'Info.plist');
  const templatePath = path.join(__dirname, '..', 'ios', 'BookmarkAI', 'Info.plist.template');
  
  // If Info.plist doesn't exist, copy from template
  if (!fs.existsSync(infoPlistPath)) {
    if (fs.existsSync(templatePath)) {
      console.log('📋 Info.plist not found, creating from template...');
      fs.copyFileSync(templatePath, infoPlistPath);
    } else {
      console.error('❌ Info.plist not found and no template available');
      console.error('   Expected at:', infoPlistPath);
      console.error('   Template at:', templatePath);
      process.exit(1);
    }
  }

  try {
    // Use PlistBuddy to update the URL scheme
    const command = `/usr/libexec/PlistBuddy -c "Set :CFBundleURLTypes:1:CFBundleURLSchemes:0 ${fullUrlScheme}" "${infoPlistPath}"`;
    await execPromise(command);
    
    console.log('✅ Google Sign-In URL scheme updated successfully');
    console.log(`   URL Scheme: ${fullUrlScheme}`);
  } catch (error) {
    console.error('❌ Failed to update Info.plist:', error.message);
    process.exit(1);
  }
}

// Run the update
updateInfoPlist().catch(error => {
  console.error('❌ Script failed:', error);
  process.exit(1);
});