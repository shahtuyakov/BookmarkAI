import { Platform, Alert } from 'react-native';
import { IOSSQLiteQueueService } from '../services/iOSSQLiteQueue';

/**
 * iOS SQLite Queue Testing Interface
 * Provides comprehensive testing capabilities for the iOS SQLite queue implementation
 */
export class IOSSQLiteQueueTester {
  private sqliteQueue: IOSSQLiteQueueService;
  private testResults: { [key: string]: boolean } = {};

  constructor() {
    this.sqliteQueue = IOSSQLiteQueueService.getInstance();
  }

  /**
   * Run comprehensive test suite
   */
  async runAllTests(): Promise<void> {
    console.log('🧪 Starting iOS SQLite Queue Test Suite');

    if (Platform.OS !== 'ios') {
      Alert.alert('Test Error', 'iOS SQLite tests can only run on iOS platform');
      return;
    }

    try {
      // Basic availability test
      await this.testAvailability();

      // Queue statistics test
      await this.testQueueStats();

      // Queue retrieval tests
      await this.testGetQueueItems();

      // Mock item creation test (since we can't easily trigger share extension in simulator)
      await this.testMockQueueOperations();

      // Display results
      this.displayTestResults();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      Alert.alert('Test Suite Failed', `Error: ${error.message}`);
    }
  }

  /**
   * Test 1: SQLite Queue Availability
   */
  private async testAvailability(): Promise<void> {
    console.log('🔍 Test 1: Checking SQLite queue availability');

    try {
      const isAvailable = this.sqliteQueue.isAvailable();
      this.testResults.availability = isAvailable;

      console.log(`📊 SQLite Queue Available: ${isAvailable}`);

      if (!isAvailable) {
        console.log('⚠️ SQLite queue not available - this is expected in some simulator configurations');
      }
    } catch (error) {
      console.error('❌ Availability test failed:', error);
      this.testResults.availability = false;
    }
  }

  /**
   * Test 2: Queue Statistics
   */
  private async testQueueStats(): Promise<void> {
    console.log('🔍 Test 2: Getting queue statistics');

    try {
      const stats = await this.sqliteQueue.getQueueStats();
      this.testResults.stats = true;

      console.log('📊 Queue Statistics:', stats);

      // Check if stats structure is valid
      if (typeof stats === 'object') {
        console.log('✅ Stats structure is valid');
      } else {
        console.log('⚠️ Stats structure unexpected');
        this.testResults.stats = false;
      }
    } catch (error) {
      console.error('❌ Stats test failed:', error);
      this.testResults.stats = false;
    }
  }

  /**
   * Test 3: Get Queue Items
   */
  private async testGetQueueItems(): Promise<void> {
    console.log('🔍 Test 3: Getting queue items');

    try {
      // Test getting all items
      const allItems = await this.sqliteQueue.getAllQueueItems();
      console.log(`📦 Total queue items: ${allItems.length}`);

      // Test getting pending items
      const pendingItems = await this.sqliteQueue.getPendingQueueItems();
      console.log(`⏳ Pending queue items: ${pendingItems.length}`);

      this.testResults.getItems = true;

      // Log sample items for inspection
      if (allItems.length > 0) {
        console.log('📋 Sample queue item:', allItems[0]);
      }

      if (pendingItems.length > 0) {
        console.log('📋 Sample pending item:', pendingItems[0]);
      }

    } catch (error) {
      console.error('❌ Get items test failed:', error);
      this.testResults.getItems = false;
    }
  }

  /**
   * Test 4: Mock Queue Operations (for simulator testing)
   */
  private async testMockQueueOperations(): Promise<void> {
    console.log('🔍 Test 4: Testing mock queue operations');

    try {
      // Since we can't easily trigger the share extension in simulator,
      // we'll test the queue management methods directly

      // Test cleanup operation
      const cleanedCount = await this.sqliteQueue.cleanupOldItems(1); // 1 hour old
      console.log(`🧹 Cleaned up ${cleanedCount} old items`);

      // Test queue stats after cleanup
      const statsAfterCleanup = await this.sqliteQueue.getQueueStats();
      console.log('📊 Stats after cleanup:', statsAfterCleanup);

      this.testResults.mockOps = true;

    } catch (error) {
      console.error('❌ Mock operations test failed:', error);
      this.testResults.mockOps = false;
    }
  }

  /**
   * Display test results summary
   */
  private displayTestResults(): void {
    console.log('\n📊 iOS SQLite Queue Test Results:');
    console.log('=====================================');

    const results = Object.entries(this.testResults);
    const passedTests = results.filter(([_, passed]) => passed).length;
    const totalTests = results.length;

    results.forEach(([testName, passed]) => {
      console.log(`${passed ? '✅' : '❌'} ${testName}: ${passed ? 'PASSED' : 'FAILED'}`);
    });

    console.log(`\n📈 Summary: ${passedTests}/${totalTests} tests passed`);

    // Show alert with results
    const message = `iOS SQLite Queue Tests\n\n${results.map(([name, passed]) =>
      `${passed ? '✅' : '❌'} ${name}`
    ).join('\n')}\n\nPassed: ${passedTests}/${totalTests}`;

    Alert.alert('Test Results', message);
  }

  /**
   * Test SQLite queue integration with SyncService
   */
  async testSyncServiceIntegration(): Promise<void> {
    console.log('🔍 Testing SyncService integration');

    try {
      // Import SyncService dynamically to avoid circular dependencies
      await import('../services/SyncService');

      // We would need an SDK client instance to test this properly
      console.log('📱 SyncService integration test would require SDK client');
      console.log('💡 This test should be run from a component with SDK context');

    } catch (error) {
      console.error('❌ SyncService integration test failed:', error);
    }
  }

  /**
   * Simulate share extension queue addition
   * This mimics what happens when the share extension adds items
   */
  async simulateShareExtensionFlow(): Promise<void> {
    console.log('🔍 Simulating share extension flow');

    try {
      // Get initial stats
      const initialStats = await this.sqliteQueue.getQueueStats();
      console.log('📊 Initial queue stats:', initialStats);

      // This would normally be done by the share extension adding to SQLite
      console.log('💡 In real usage, share extension would add items to SQLite queue');
      console.log('💡 Then ShareHandler would detect new items and send to React Native');
      console.log('💡 SyncService would process the items and update their status');

      // Simulate checking for new items (what ShareHandler does)
      const pendingItems = await this.sqliteQueue.getPendingQueueItems();
      console.log(`📦 Found ${pendingItems.length} pending items to process`);

      if (pendingItems.length > 0) {
        console.log('📋 Pending items:', pendingItems);
      }

    } catch (error) {
      console.error('❌ Share extension simulation failed:', error);
    }
  }

  /**
   * Test database location and permissions
   */
  async testDatabaseLocation(): Promise<void> {
    console.log('🔍 Testing database location and permissions');

    try {
      // The SQLite database should be in the app group container
      console.log('📍 Expected database location: App Group Container');
      console.log('🔗 App Group ID: group.com.bookmarkai');
      console.log('📁 Database file: bookmark_queue.sqlite');

      // Test if we can get stats (which requires database access)
      const stats = await this.sqliteQueue.getQueueStats();

      if (Object.keys(stats).length > 0 || stats.constructor === Object) {
        console.log('✅ Database appears accessible');
        this.testResults.databaseAccess = true;
      } else {
        console.log('⚠️ Database access unclear');
        this.testResults.databaseAccess = false;
      }

    } catch (error) {
      console.error('❌ Database location test failed:', error);
      this.testResults.databaseAccess = false;
    }
  }

  /**
   * Generate test report for debugging
   */
  generateTestReport(): string {
    const timestamp = new Date().toISOString();
    const results = Object.entries(this.testResults);
    const passedTests = results.filter(([_, passed]) => passed).length;

    return `
iOS SQLite Queue Test Report
Generated: ${timestamp}
Platform: ${Platform.OS} ${Platform.Version}

Test Results:
${results.map(([test, passed]) => `- ${test}: ${passed ? 'PASS' : 'FAIL'}`).join('\n')}

Summary: ${passedTests}/${results.length} tests passed

Notes:
- SQLite queue availability depends on native bridge compilation
- In simulator, some features may have limited functionality
- Real testing requires share extension trigger or manual queue population
- App group container access is required for cross-app functionality
    `.trim();
  }
}

/**
 * Quick test function for easy import and use
 */
export const runIOSSQLiteQueueTests = async (): Promise<void> => {
  const tester = new IOSSQLiteQueueTester();
  await tester.runAllTests();
};

/**
 * Advanced test with detailed reporting
 */
export const runDetailedIOSSQLiteQueueTests = async (): Promise<string> => {
  const tester = new IOSSQLiteQueueTester();

  await tester.testAvailability();
  await tester.testDatabaseLocation();
  await tester.testQueueStats();
  await tester.testGetQueueItems();
  await tester.testMockQueueOperations();
  await tester.simulateShareExtensionFlow();

  return tester.generateTestReport();
};

/**
 * Clear all items from SQLite queue (using cleanup method as workaround)
 */
export const clearIOSSQLiteQueue = async (): Promise<void> => {
  const sqliteQueue = IOSSQLiteQueueService.getInstance();
  console.log('🗑️ Clearing iOS SQLite queue using cleanup workaround...');

  try {
    // Use cleanup with 0 hours to clear all completed/failed items
    let deletedCount = await sqliteQueue.cleanupOldItems(0);
    console.log(`🧹 Cleaned up ${deletedCount} old items`);

    // Try to get all items to see what's left
    const allItems = await sqliteQueue.getAllQueueItems();
    console.log(`📊 Items remaining after cleanup: ${allItems.length}`);

    if (allItems.length > 0) {
      console.log('⚠️ Some items still remain. Try updating them to completed status first.');

      // Try to mark pending items as completed so they can be cleaned up
      for (const item of allItems) {
        try {
          await sqliteQueue.updateQueueItemStatus(item.id, 'completed');
          console.log(`✅ Marked item ${item.id} as completed`);
        } catch (error) {
          console.log(`❌ Failed to update item ${item.id}:`, error);
        }
      }

      // Try cleanup again
      deletedCount = await sqliteQueue.cleanupOldItems(0);
      console.log(`🧹 Second cleanup removed ${deletedCount} items`);
    }

    Alert.alert('Cleanup Complete', 'Removed items using cleanup method');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    Alert.alert('Error', `Failed to cleanup queue: ${error.message}`);
  }
};

/**
 * Debug SQLite queue contents
 */
export const debugIOSSQLiteQueue = async (): Promise<void> => {
  const sqliteQueue = IOSSQLiteQueueService.getInstance();
  console.log('🔍 Debugging iOS SQLite queue contents...');

  try {
    // Get all items
    const allItems = await sqliteQueue.getAllQueueItems();
    console.log(`📊 Total items in queue: ${allItems.length}`);

    allItems.forEach((item, index) => {
      console.log(`📦 Item ${index + 1}:`);
      console.log(`   ID: "${item.id}" (length: ${item.id?.length || 0})`);
      console.log(`   URL: "${item.url}" (length: ${item.url?.length || 0})`);
      console.log(`   Title: "${item.title}" (length: ${item.title?.length || 0})`);
      console.log(`   Notes: "${item.notes}" (length: ${item.notes?.length || 0})`);
      console.log(`   Status: "${item.status}"`);
      console.log(`   Created: ${new Date(item.timestamp)}`);
    });

    // Get queue stats
    const stats = await sqliteQueue.getQueueStats();
    console.log('📊 Queue Statistics:', stats);

    Alert.alert('Debug Complete', `Found ${allItems.length} items. Check console for details.`);
  } catch (error) {
    console.error('❌ Error debugging queue:', error);
    Alert.alert('Error', `Failed to debug queue: ${error.message}`);
  }
};

/**
 * Add test item to SQLite queue
 */
export const addTestIOSSQLiteItem = async (): Promise<void> => {
  // Since the native method isn't available, let's just run debug for now
  console.log('🧪 Running debug instead of add test (method not available yet)...');
  await debugIOSSQLiteQueue();
};
