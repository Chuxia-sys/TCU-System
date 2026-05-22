import { execSync } from 'child_process';
import { FIREBASE_PROJECT_ID } from './firebase';
import { FirestoreIndexDefinition } from './firestore-index-manager';

export type FirestoreIndexDeployerConfig = {
  autoDeployIndexes?: boolean;
  debug?: boolean;
  projectId?: string;
  dryRun?: boolean;
};

class FirestoreIndexDeployer {
  private pendingIndexes: FirestoreIndexDefinition[] = [];
  private lastDeployment: { timestamp: number; success: boolean; output: string } | null = null;
  private config: FirestoreIndexDeployerConfig = {
    autoDeployIndexes: false,
    debug: false,
    projectId: FIREBASE_PROJECT_ID,
    dryRun: false,
  };

  configure(config: FirestoreIndexDeployerConfig): void {
    this.config = { ...this.config, ...config };
  }

  queueIndexes(indexes: FirestoreIndexDefinition[]): void {
    for (const index of indexes) {
      const duplicate = this.pendingIndexes.some((pending) =>
        pending.collectionGroup === index.collectionGroup &&
        pending.fields.length === index.fields.length &&
        pending.fields.every((field, idx) =>
          field.fieldPath === index.fields[idx].fieldPath && field.order === index.fields[idx].order
        )
      );

      if (!duplicate) {
        this.pendingIndexes.push(index);
      }
    }

    if (this.config.autoDeployIndexes) {
      void this.processQueue();
    }
  }

  async processQueue(): Promise<void> {
    if (this.pendingIndexes.length === 0) {
      return;
    }

    if (this.config.debug) {
      console.log('[IndexDeployer] Deploying indexes for project:', this.config.projectId);
      console.log('[IndexDeployer] pending index count:', this.pendingIndexes.length);
    }

    const args = ['deploy', '--only', 'firestore:indexes', '--project', this.config.projectId];
    if (this.config.dryRun) {
      args.push('--dry-run');
    }

    const command = `npx --yes firebase ${args.map((arg) => `${arg}`).join(' ')}`;

    try {
      const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' });
      this.lastDeployment = { timestamp: Date.now(), success: true, output };
      this.pendingIndexes = [];
      console.log('[IndexDeployer] Firebase index deployment succeeded.');
      return output;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastDeployment = { timestamp: Date.now(), success: false, output: message };
      console.warn('[IndexDeployer] Firebase index deployment failed:', message);
      return;
    }
  }

  getStatus(): { pending: number; lastDeployment: { timestamp: number; success: boolean; output: string } | null; config: FirestoreIndexDeployerConfig } {
    return {
      pending: this.pendingIndexes.length,
      lastDeployment: this.lastDeployment,
      config: this.config,
    };
  }

  logStatus(): void {
    const status = this.getStatus();
    console.log('[IndexDeployer] pending:', status.pending, 'autoDeploy:', status.config.autoDeployIndexes);
    if (status.lastDeployment) {
      console.log('[IndexDeployer] last deployment:', new Date(status.lastDeployment.timestamp).toISOString(), 'success:', status.lastDeployment.success);
    }
  }
}

export const indexDeployer = new FirestoreIndexDeployer();
