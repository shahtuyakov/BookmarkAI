import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConfigService } from '../../../config/services/config.service';

/**
 * Service for fetching YouTube video transcripts/captions
 * Uses YouTube Data API v3 with OAuth2 service account authentication
 * Falls back to yt-dlp if API fails or captions are unavailable
 */
@Injectable()
export class YouTubeTranscriptService {
  private readonly logger = new Logger(YouTubeTranscriptService.name);

  constructor(configService: ConfigService) {
    this.logger.log('YouTube transcript service initialized with yt-dlp method');
  }


  /**
   * Main method to fetch transcript/captions for a YouTube video
   * @param videoId YouTube video ID
   * @returns Transcript text or null if not available
   */
  async fetchTranscript(videoId: string): Promise<string | null> {
    try {
      // Validate video ID format
      if (!videoId || typeof videoId !== 'string' || videoId.length !== 11) {
        this.logger.error(`Invalid video ID format: ${videoId}`);
        return null;
      }

      // Use yt-dlp method to fetch transcript
      const ytDlpTranscript = await this.fetchTranscriptViaYtDlp(videoId);
      
      if (ytDlpTranscript) {
        // Check if it's the placeholder message
        if (ytDlpTranscript.startsWith('CAPTIONS_UNAVAILABLE:')) {
          this.logger.warn('Captions exist but extraction failed');
          return null;
        }
        return ytDlpTranscript;
      }

      this.logger.warn(`No transcript available for video ${videoId} from any method`);
      return null;

    } catch (error: any) {
      this.logger.error(`Failed to fetch transcript for video ${videoId}: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Fetch transcript using yt-dlp
   */
  private async fetchTranscriptViaYtDlp(videoId: string): Promise<string | null> {
    try {
      const { spawn } = await import('child_process');
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      const tmpBase = `/tmp/youtube-${videoId}-${randomUUID()}`;
      
      return new Promise((resolve) => {
        // First, check if subtitles are available
        const checkArgs = [
          '--list-subs',
          '--skip-download',
          url
        ];

        const checkProcess = spawn('yt-dlp', checkArgs);
        let checkOutput = '';

        checkProcess.stdout.on('data', (data) => {
          checkOutput += data.toString();
        });

        checkProcess.stderr.on('data', (data) => {
          checkOutput += data.toString();
        });

        checkProcess.on('close', async (code) => {
          if (code !== 0 || !checkOutput.includes('en')) {
            this.logger.log(`No English subtitles found for video ${videoId}`);
            const fs = await import('fs/promises');
            await fs.rm(`${tmpBase}*`, { force: true, recursive: false }).catch(() => {});
            resolve(null);
            return;
          }

          // Now extract the subtitles with enhanced options to avoid throttling
          const extractArgs = [
            '--write-sub',
            '--write-auto-sub',
            '--sub-lang', 'en',
            '--skip-download',
            '--output', `${tmpBase}`,
            '--force-ipv4', // Force IPv4 to avoid network issues
            '--no-playlist',
            '--no-check-certificate', // Skip certificate checks
            '--user-agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            '--extractor-args', 'youtube:player_client=android', // Use Android client to avoid nsig issues
            '--sleep-interval', '1', // Add delay to avoid rate limiting
            '--max-sleep-interval', '5',
            url
          ];

          const extractProcess = spawn('yt-dlp', extractArgs);
          let extractOutput = '';
          let extractError = '';

          extractProcess.stdout.on('data', (data) => {
            extractOutput += data.toString();
          });

          extractProcess.stderr.on('data', (data) => {
            extractError += data.toString();
          });

          extractProcess.on('close', async (extractCode) => {
            if (extractCode !== 0) {
              this.logger.error(`Failed to extract subtitles: ${extractError}`);
              
              // Check if it's the nsig extraction error
              if (extractError.includes('nsig extraction failed') || 
                  extractError.includes('Did not get any data blocks') ||
                  extractError.includes('Sign in to confirm') ||
                  extractError.includes('HTTP Error 429') ||
                  extractError.includes('ERROR')) {
                // Log the specific error type
                if (extractError.includes('nsig extraction failed')) {
                  this.logger.warn(`YouTube throttling detected for video ${videoId} - nsig extraction failed`);
                } else if (extractError.includes('Sign in to confirm')) {
                  this.logger.warn(`YouTube requires sign-in for video ${videoId}`);
                } else if (extractError.includes('HTTP Error 429')) {
                  this.logger.warn(`Rate limited by YouTube for video ${videoId}`);
                } else {
                  this.logger.warn(`yt-dlp error for video ${videoId}: ${extractError.split('\n').find(line => line.includes('ERROR')) || extractError.split('\n')[0]}`);
                }
                const fs = await import('fs/promises');
                await fs.rm(`${tmpBase}*`, { force: true, recursive: false }).catch(() => {});
                // Return a placeholder to indicate captions exist but couldn't be extracted
                resolve('CAPTIONS_UNAVAILABLE: YouTube captions detected but extraction failed due to platform restrictions.');
                return;
              }
              const fs = await import('fs/promises');
              await fs.rm(`${tmpBase}*`, { force: true, recursive: false }).catch(() => {});
              resolve(null);
              return;
            }

            // Read the subtitle file
            try {
              const fs = await import('fs/promises');
              const path = await import('path');
              
              // Look for subtitle files with various extensions
              const possibleFiles = [
                `${tmpBase}.en.srt`,
                `${tmpBase}.en.vtt`,
                `${tmpBase}.en.ttml`,
                `${tmpBase}.en.srv3`,
                `${tmpBase}.en.srv2`,
                `${tmpBase}.en.srv1`,
                `${tmpBase}.en.json3`,
              ];
              
              let subtitlePath = '';
              let subtitleFound = false;
              
              for (const filePath of possibleFiles) {
                try {
                  await fs.access(filePath);
                  subtitlePath = filePath;
                  subtitleFound = true;
                  this.logger.log(`Found subtitle file: ${path.basename(filePath)}`);
                  break;
                } catch {
                  // Continue checking other formats
                }
              }
              
              if (!subtitleFound) {
                // List files in /tmp to debug
                const files = await fs.readdir('/tmp');
                const ytFiles = files.filter(f => f.includes(`youtube-${videoId}`));
                this.logger.error(`No subtitle file found. Files in /tmp: ${ytFiles.join(', ')}`);
                await fs.rm(`${tmpBase}*`, { force: true, recursive: false }).catch(() => {});
                resolve(null);
                return;
              }

              const subtitleContent = await fs.readFile(subtitlePath, 'utf-8');
              
              let textOnly = '';
              
              // Handle different subtitle formats
              if (subtitlePath.endsWith('.json3')) {
                // YouTube's JSON format
                try {
                  const jsonData = JSON.parse(subtitleContent);
                  textOnly = this.extractTextFromJson3(jsonData);
                } catch (parseError) {
                  this.logger.error(`Failed to parse JSON3 subtitle: ${parseError.message}`);
                }
              } else {
                // SRT/VTT format
                textOnly = this.extractTextFromSubtitles(subtitleContent);
              }
              
              // Clean up temp file
              await fs.unlink(subtitlePath).catch(() => {});
              // Remove any other leftover temp files (best effort)
              await fs.rm(`${tmpBase}*`, { force: true, recursive: false }).catch(() => {});
              
              if (!textOnly || textOnly.length < 10) {
                this.logger.error(`Extracted text too short or empty`);
                resolve(null);
                return;
              }
              
              this.logger.log(`Successfully extracted ${textOnly.length} characters of transcript`);
              resolve(textOnly);
            } catch (error) {
              this.logger.error(`Failed to read subtitle file: ${error.message}`);
              const fs = await import('fs/promises');
              await fs.rm(`${tmpBase}*`, { force: true, recursive: false }).catch(() => {});
              resolve(null);
            }
          });

          extractProcess.on('error', async (error) => {
            this.logger.error(`Failed to spawn yt-dlp for extraction: ${error.message}`);
            const fs = await import('fs/promises');
            await fs.rm(`${tmpBase}*`, { force: true, recursive: false }).catch(() => {});
            resolve(null);
          });
        });

        checkProcess.on('error', async (error) => {
          this.logger.error(`Failed to spawn yt-dlp for subtitle check: ${error.message}`);
          const fs = await import('fs/promises');
          await fs.rm(`${tmpBase}*`, { force: true, recursive: false }).catch(() => {});
          resolve(null);
        });
      });
    } catch (error) {
      this.logger.error(`Failed to fetch transcript via yt-dlp: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract plain text from SRT/VTT subtitle format
   */
  private extractTextFromSubtitles(subtitleContent: string): string {
    // Remove timecodes and formatting from SRT/VTT
    const lines = subtitleContent.split('\n');
    const textLines: string[] = [];
    
    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Skip timecode lines (e.g., "00:00:01,000 --> 00:00:04,000")
      if (line.includes('-->')) continue;
      
      // Skip subtitle numbers in SRT format
      if (/^\d+$/.test(line.trim())) continue;
      
      // Skip VTT header
      if (line.startsWith('WEBVTT')) continue;
      
      // Remove HTML tags if any
      const cleanLine = line.replace(/<[^>]*>/g, '').trim();
      
      if (cleanLine) {
        textLines.push(cleanLine);
      }
    }
    
    // Join with spaces, removing duplicate lines
    const uniqueLines = [...new Set(textLines)];
    return uniqueLines.join(' ');
  }

  /**
   * Extract text from YouTube's JSON3 subtitle format
   */
  private extractTextFromJson3(jsonData: any): string {
    try {
      const texts: string[] = [];
      
      // Navigate through YouTube's JSON structure
      if (jsonData.events) {
        for (const event of jsonData.events) {
          if (event.segs) {
            for (const seg of event.segs) {
              if (seg.utf8) {
                texts.push(seg.utf8);
              }
            }
          }
        }
      }
      
      return texts.join(' ').replace(/\s+/g, ' ').trim();
    } catch (error) {
      this.logger.error(`Failed to extract text from JSON3: ${error.message}`);
      return '';
    }
  }
}