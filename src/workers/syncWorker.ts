
// src/workers/syncWorker.ts

self.onmessage = (e: MessageEvent) => {
  console.log('Message received in worker:', e.data);
  if (e.data === 'start-sync') {
    console.log('Starting sync process in worker...');
    // Simulate a long-running task
    setTimeout(() => {
      self.postMessage('sync-complete');
      console.log('Sync process finished in worker.');
    }, 5000);
  }
};

export {};
