import { Octokit } from '@octokit/rest';
import { chunkArray } from './utils.js';

export class GithubService {
  private github: Octokit;
  private maxConcurrentScans = parseInt(process.env.MAX_CONCURRENT_SCANS) || 2;
  private reposCache: Record<string, any>[] = [];
  private branchesCache = new Map<string, Record<string, any>>();
  private storedBranchesEtags = new Map<string, string>();
  private storedWebhooksEtags = new Map<string, string>();
  private storedWebhooksData = new Map<string, Number>();
  private storedBlobEtags = new Map<string, string>();
  private storedContentData = new Map<string, string>();

  constructor() {
    this.github = new Octokit({
      auth: process.env.GITHUB_ACCESS_TOKEN
    });
  }

  public async getRepositories() {
    try {
      const reposList = await this.github.request('GET /user/repos', {
        headers: {
          'If-None-Match': this.reposCache.length ? this.reposCache[0].etag : ''
        }
      });
      const etag = reposList.headers.etag;
      this.reposCache = reposList.data.reduce((acc: Record<string, any>[], repo: Record<string, any>) => {
        const withEtag = { ...repo, etag };
        acc.push(withEtag);
        return acc;
      }, []);
      return this.reposCache;
    } catch (error) {
      if (error.status === 304) {
        return this.reposCache;
      }
    }
  }

  public async repositiriesDetailed() {
    {
      const reposList = this.reposCache.length ? this.reposCache : await this.getRepositories();
      if (reposList.length <= this.maxConcurrentScans) {
        const detailedRepos = await Promise.all(reposList.map(repo => this.getDetailedRepository(repo)));
        return detailedRepos;
      }

      const chunks = chunkArray(reposList, this.maxConcurrentScans);

      let detailedReposByChunks = [];
      for (const chunk of chunks) {
        const result = await Promise.all(chunk.map(repo => this.getDetailedRepository(repo)));
        detailedReposByChunks = detailedReposByChunks.concat(result);
      }

      return detailedReposByChunks;
    }
  }

  private async getDetailedRepository(repo: Record<string, any>) {
    const branchData = await this.getBranchData(repo);

    const sha = branchData.commit.sha;

    const { fileCount, yamlContent } = await this.getTreeData(repo, sha);

    const activeWebhooks = await this.getAcitveWebhooks(repo);

    const parsedRepo = {
      ...repo,
      files_count: fileCount,
      active_webhooks: activeWebhooks,
      yaml_content: yamlContent
    };

    return parsedRepo;
  }

  private async getBranchData(repo: Record<string, any>) {
    const storedEtag = this.storedBranchesEtags.get(repo.name);
    try {
      const {
        data: branchData,
        headers: { etag }
      } = await this.github.repos.getBranch({
        owner: repo.owner.login,
        repo: repo.name,
        branch: repo.default_branch,
        headers: {
          'If-None-Match': storedEtag || ''
        }
      });
      this.storedBranchesEtags.set(repo.name, etag);
      this.branchesCache.set(etag, branchData);
      return branchData;
    } catch (error) {
      if (error.status === 304) {
        return this.branchesCache.get(storedEtag);
      }
    }
  }

  // I'm not sure why, but here usage of Etag will drop the connection with "other side closed" error
  private async getTreeData(repo: Record<string, any>, sha: string) {
    const { data: treeData } = await this.github.git.getTree({
      owner: repo.owner.login,
      repo: repo.name,
      tree_sha: sha,
      recursive: 'true'
    });

    let fileCount = 0;
    let yamlFile = null;

    for (const item of treeData.tree) {
      if (item.type === 'blob') {
        fileCount++;
        if (!yamlFile && item.path.endsWith('.yaml')) {
          yamlFile = item;
        }
      }
    }

    if (!yamlFile) {
      const tree = { fileCount, yamlContent: null };
      return tree;
    }

    const yamlContent = await this.getBlobContent(repo, yamlFile);

    const tree = {
      fileCount,
      yamlContent: {
        file_name: yamlFile.path,
        content: yamlContent
      }
    };
    return tree;
  }

  private async getBlobContent(repo: Record<string, any>, yamlFile: Record<string, any>) {
    if (!yamlFile) {
      return;
    }

    const { sha } = yamlFile;

    const storedEtag = this.storedBlobEtags.get(sha);
    try {
      const {
        data: blobData,
        headers: { etag }
      } = await this.github.git.getBlob({
        owner: repo.owner.login,
        repo: repo.name,
        file_sha: sha,
        headers: {
          'If-None-Match': storedEtag || ''
        }
      });

      // I left content as a string, so we have less data to transfer
      // I also send encoding as a separate field, so we can use it to decode the content on the client side
      const { content } = blobData;

      this.storedBlobEtags.set(sha, etag);
      this.storedContentData.set(sha, content);
      return content;
    } catch (error) {
      if (error.status === 304) {
        return this.storedContentData.get(sha);
      }
    }
  }

  private async getAcitveWebhooks(repo: Record<string, any>) {
    const storedEtag = this.storedWebhooksEtags.get(repo.name);
    try {
      const {
        data: webhooks,
        headers: { etag }
      } = await this.github.repos.listWebhooks({
        owner: repo.owner.login,
        repo: repo.name,
        headers: {
          'If-None-Match': storedEtag || ''
        }
      });

      const activeWebhooks = webhooks.filter(webhook => webhook.active).length;

      this.storedWebhooksEtags.set(repo.name, etag);
      this.storedWebhooksData.set(repo.name, activeWebhooks);

      return activeWebhooks;
    } catch (error) {
      if (error.status === 304) {
        return this.storedWebhooksData.get(repo.name);
      }
    }
  }
}
