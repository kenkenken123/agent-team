export interface GitFileStatus {
    path: string;
    status: string;
}

export interface GitStatusInfo {
    branch: string;
    files: GitFileStatus[];
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
    }
};
