import { IndexerWorker } from './indexer.worker';

async function bootstrap(): Promise<void> {
  const worker = new IndexerWorker();
  await worker.start();
  console.log('indexer worker started');
}

void bootstrap();
