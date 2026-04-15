const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5501';

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified: string;
  path: string;
}

export const fileApi = {
  /**
   * 获取目录下的文件列表
   * @param path 目录路径
   */
  async list(path: string): Promise<FileEntry[]> {
    const response = await fetch(`${BASE_URL}/api/files/list?path=${encodeURIComponent(path)}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || '获取目录列表失败');
    }

    const result = await response.json();
    return result.data;
  }
};
