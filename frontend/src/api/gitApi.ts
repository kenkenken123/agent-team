export interface GitFileStatus {
    path: string;
    status: string;
}

export interface GitStatusInfo {
    branch: string;
    files: GitFileStatus[];
}

export interface GitBranchInfo {
    name: string;
    isRemote: boolean;
    isCurrent: boolean;
}

export interface CodeReviewResponse {
    taskId: string;
    agentName: string;
    routingReason: string;
    message: string;
}

export interface CommitPushResponse {
    message: string;
}

export interface GenerateCommitMessageResponse {
    message: string;
}

export const gitApi = {
    async getStatus(path: string): Promise<GitStatusInfo> {
        const url = `http://localhost:5501/api/git/status?path=${encodeURIComponent(path)}`;
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to fetch git status');
        }
        return res.json();
    },

    async getDiff(path: string, filePath: string): Promise<string> {
        const url = `http://localhost:5501/api/git/diff?path=${encodeURIComponent(path)}&filePath=${encodeURIComponent(filePath)}`;
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || 'Failed to fetch git diff');
        }
        return res.text();
    },

    async codeReview(path: string): Promise<CodeReviewResponse> {
        const url = 'http://localhost:5501/api/git/code-review';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '代码审查任务创建失败');
        }
        return res.json();
    },

    async commitPush(path: string, message: string): Promise<CommitPushResponse> {
        const url = 'http://localhost:5501/api/git/commit-push';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, message })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '提交推送失败');
        }
        return res.json();
    },

    async generateCommitMessage(path: string): Promise<GenerateCommitMessageResponse> {
        const url = 'http://localhost:5501/api/git/generate-commit-message';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '生成提交信息失败');
        }
        return res.json();
    },

    async revertFile(path: string, filePath: string, status: string): Promise<{ message: string }> {
        const url = 'http://localhost:5501/api/git/revert-file';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, filePath, status })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '撤销文件变更失败');
        }
        return res.json();
    },

    async getBranches(path: string): Promise<GitBranchInfo[]> {
        const url = `http://localhost:5501/api/git/branches?path=${encodeURIComponent(path)}`;
        const res = await fetch(url);
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '获取分支列表失败');
        }
        return res.json();
    },

    async switchBranch(path: string, branch: string): Promise<{ message: string }> {
        const url = 'http://localhost:5501/api/git/switch-branch';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, branch })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '切换分支失败');
        }
        return res.json();
    }
};
