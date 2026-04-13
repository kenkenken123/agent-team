export interface GitFileStatus {
    path: string;
    status: string;
}

export interface GitStatusInfo {
    branch: string;
    files: GitFileStatus[];
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
    }
};
