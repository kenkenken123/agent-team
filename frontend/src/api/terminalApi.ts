export const terminalApi = {
    async open(path: string, terminalType?: string): Promise<void> {
        const url = 'http://localhost:5501/api/terminal/open';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, terminalType })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '打开终端失败');
        }
    },

    async openFolder(path: string): Promise<void> {
        const url = 'http://localhost:5501/api/terminal/open-folder';
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.error || '打开文件夹失败');
        }
    }
};
