import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../../config/services/config.service';
import { YoutubeTranscript } from 'youtube-transcript';

/**
 * Service for fetching YouTube video transcripts/captions
 * Uses YouTube API v3 captions endpoint
 */
@Injectable()
export class YouTubeTranscriptService {
  private readonly logger = new Logger(YouTubeTranscriptService.name);
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    this.apiKey = this.configService.get('YOUTUBE_API_KEY', '');
  }

  /**
   * Fetch transcript using youtube-transcript package (primary method)
   * This method doesn't require OAuth and works around yt-dlp issues
   */
  async fetchTranscriptViaPackage(videoId: string): Promise<string | null> {
    try {
      this.logger.log(`Attempting to fetch transcript using youtube-transcript package for video ${videoId}`);
      
      // Try with both video ID and full URL
      let transcriptItems;
      try {
        // First try with just the video ID
        transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
      } catch (error) {
        // If that fails, try with full URL
        this.logger.log(`Trying with full URL for video ${videoId}`);
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        transcriptItems = await YoutubeTranscript.fetchTranscript(url);
      }
      
      if (!transcriptItems || transcriptItems.length === 0) {
        this.logger.log(`No transcript items found for video ${videoId}`);
        return null;
      }
      
      // Combine all transcript segments into one text
      const fullTranscript = transcriptItems
        .map(item => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      this.logger.log(`Successfully fetched ${fullTranscript.length} characters of transcript using youtube-transcript package`);
      return fullTranscript;
    } catch (error) {
      this.logger.error(`Failed to fetch transcript via youtube-transcript package: ${error.message}`, error.stack);
      
      // Check if it's a specific error about no captions
      if (error.message?.includes('Could not find') || error.message?.includes('Transcript is disabled')) {
        this.logger.warn(`Video ${videoId} appears to have no captions available`);
      }
      
      return null;
    }
  }

  /**
   * Fetch transcript/captions for a YouTube video
   * @param videoId YouTube video ID
   * @returns Transcript text or null if not available
   */
  async fetchTranscript(videoId: string): Promise<string | null> {
    try {
      // First, list available captions
      const captionsUrl = `https://www.googleapis.com/youtube/v3/captions`;
      const listParams = new URLSearchParams({
        videoId,
        part: 'snippet',
        key: this.apiKey,
      });

      const listResponse = await fetch(`${captionsUrl}?${listParams}`);
      const captionsList = await listResponse.json();

      if (!captionsList.items || captionsList.items.length === 0) {
        this.logger.log(`No captions available for video ${videoId}`);
        return null;
      }

      // Find English captions (prefer auto-generated if no manual ones)
      const englishCaption = captionsList.items.find(
        (item: any) => item.snippet.language === 'en'
      );

      if (!englishCaption) {
        this.logger.log(`No English captions found for video ${videoId}`);
        return null;
      }

      // Note: YouTube API v3 doesn't provide direct access to caption content
      // We would need to use OAuth2 and the download endpoint, or use a third-party solution
      
      // For now, we'll return a placeholder indicating captions are available
      // In production, you'd want to use:
      // 1. OAuth2 authentication for caption download
      // 2. Or use youtube-transcript library (unofficial but works)
      // 3. Or use yt-dlp to extract subtitles
      
      this.logger.warn(
        `Captions detected for video ${videoId} but direct download requires OAuth2. ` +
        `Consider using youtube-transcript npm package or yt-dlp for subtitle extraction.`
      );

      // TODO: Implement actual caption fetching
      // Options:
      // 1. Use youtube-transcript npm package
      // 2. Use yt-dlp with --write-sub --skip-download flags
      // 3. Implement OAuth2 flow for official API access

      return null; // For now, return null to trigger fallback
    } catch (error) {
      this.logger.error(`Failed to fetch transcript for video ${videoId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch transcript using yt-dlp (alternative approach)
   * This is more reliable as it doesn't require OAuth2
   */
  async fetchTranscriptViaYtDlp(videoId: string): Promise<string | null> {
    try {
      const { spawn } = await import('child_process');
      const url = `https://www.youtube.com/watch?v=${videoId}`;
      
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

        checkProcess.on('close', (code) => {
          if (code !== 0 || !checkOutput.includes('en')) {
            this.logger.log(`No English subtitles found for video ${videoId}`);
            resolve(null);
            return;
          }

          // Now extract the subtitles with a simpler approach
          const extractArgs = [
            '--write-sub',
            '--write-auto-sub',
            '--sub-lang', 'en',
            '--skip-download',
            '--output', `/tmp/youtube-${videoId}`,
            '--force-ipv4', // Force IPv4 to avoid network issues
            '--no-playlist',
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
              if (extractError.includes('nsig extraction failed') || extractError.includes('Did not get any data blocks')) {
                this.logger.warn(`Known yt-dlp issue with video ${videoId}. Returning placeholder.`);
                // Return a placeholder to indicate captions exist but couldn't be extracted
                resolve('CAPTIONS_UNAVAILABLE: YouTube captions detected but extraction failed due to yt-dlp limitations. Consider implementing alternative extraction method.');
                return;
              }
              
              resolve(null);
              return;
            }

            // Read the subtitle file
            try {
              const fs = await import('fs/promises');
              const path = await import('path');
              
              // Look for subtitle files with various extensions
              const possibleFiles = [
                `/tmp/youtube-${videoId}.en.srt`,
                `/tmp/youtube-${videoId}.en.vtt`,
                `/tmp/youtube-${videoId}.en.ttml`,
                `/tmp/youtube-${videoId}.en.srv3`,
                `/tmp/youtube-${videoId}.en.srv2`,
                `/tmp/youtube-${videoId}.en.srv1`,
                `/tmp/youtube-${videoId}.en.json3`,
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
              
              if (!textOnly || textOnly.length < 10) {
                this.logger.error(`Extracted text too short or empty`);
                resolve(null);
                return;
              }
              
              this.logger.log(`Successfully extracted ${textOnly.length} characters of transcript`);
              resolve(textOnly);
            } catch (error) {
              this.logger.error(`Failed to read subtitle file: ${error.message}`);
              resolve(null);
            }
          });

          extractProcess.on('error', (error) => {
            this.logger.error(`Failed to spawn yt-dlp for extraction: ${error.message}`);
            resolve(null);
          });
        });

        checkProcess.on('error', (error) => {
          this.logger.error(`Failed to spawn yt-dlp for subtitle check: ${error.message}`);
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