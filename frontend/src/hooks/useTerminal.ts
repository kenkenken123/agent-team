import { useRef, useCallback } from 'react';

import type { Terminal } from '@xterm/xterm';
import type { FitAddon } from '@xterm/addon-fit';

export function useTerminal(
  containerRef: React.RefObject<HTMLDivElement | null>,
  onLinkClick?: (uri: string) => void
) {
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const bufferRef = useRef<string>('');
  const rowsCountRef = useRef<number>(5);
  const queueRef = useRef<string>('');
  const typingRef = useRef<boolean>(false);

  const init = useCallback(async () => {
    if (!containerRef.current || termRef.current) return;

    const { Terminal } = await import('@xterm/xterm');
    const { FitAddon } = await import('@xterm/addon-fit');
    const { WebLinksAddon } = await import('@xterm/addon-web-links');

    const term = new Terminal({
      theme: {
        background: '#0D1117',
        foreground: '#C9D1D9',
        cursor: '#58A6FF',
        selectionBackground: '#264F78',
        black: '#0D1117',
        brightBlack: '#484F58',
        red: '#FF7B72',
        brightRed: '#FFA198',
        green: '#3FB950',
        brightGreen: '#56D364',
        yellow: '#D29922',
        brightYellow: '#E3B341',
        blue: '#58A6FF',
        brightBlue: '#79C0FF',
        magenta: '#BC8CFF',
        brightMagenta: '#D2A8FF',
        cyan: '#39C5CF',
        brightCyan: '#56D4DD',
        white: '#B1BAC4',
        brightWhite: '#F0F6FC',
      },
      fontFamily: '"JetBrains Mono", "Cascadia Code", "Fira Code", monospace',
      fontSize: 13,
      lineHeight: 1.5,
      cursorBlink: true,
      scrollback: 5000,
      allowProposedApi: true,
      disableStdin: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon((e, uri) => {
      if (uri.startsWith('http://show-thinking/')) {
        e.preventDefault();
        onLinkClick?.(uri);
      } else {
        window.open(uri, '_blank');
      }
    });
    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    
    // 自定义按键处理器：允许 Ctrl+C / Cmd+C 复制纯文本
    term.attachCustomKeyEventHandler((e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && term.hasSelection()) {
        navigator.clipboard.writeText(term.getSelection());
        return false;
      }
      return true;
    });

    term.open(containerRef.current!);
    fitAddon.fit();

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    if (bufferRef.current) {
      const initLines = (bufferRef.current.match(/\n/g) || []).length;
      rowsCountRef.current = Math.max(5, initLines + 2);
      term.resize(term.cols, Math.min(rowsCountRef.current, 40));
      
      term.write(bufferRef.current.replace(/\n/g, '\r\n'));
      bufferRef.current = '';
    }

    return term;
  }, [containerRef]);

  const processQueue = useCallback(async () => {
    if (typingRef.current || !termRef.current || !queueRef.current) return;
    typingRef.current = true;

    while (queueRef.current.length > 0 && termRef.current) {
      const L = queueRef.current.length;
      let chunkLength = 1;
      if (L > 2000) chunkLength = 30;
      else if (L > 500) chunkLength = 10;
      else if (L > 100) chunkLength = 5;
      else chunkLength = 2; // 默认每次打出2个字符

      const chunk = queueRef.current.slice(0, chunkLength);
      queueRef.current = queueRef.current.slice(chunkLength);
      
      rowsCountRef.current += (chunk.match(/\n/g) || []).length;
      const targetRows = Math.min(Math.max(rowsCountRef.current, 5), 40);
      if (termRef.current.rows !== targetRows) {
        termRef.current.resize(termRef.current.cols, targetRows);
      }

      termRef.current.write(chunk);
      
      await new Promise(r => setTimeout(r, 15));
    }

    typingRef.current = false;
  }, []);

  const write = useCallback((text: string, instant = false) => {
    const formatted = text.replace(/\n/g, '\r\n');
    if (termRef.current) {
      if (instant) {
        rowsCountRef.current += (formatted.match(/\n/g) || []).length;
        const targetRows = Math.min(Math.max(rowsCountRef.current, 5), 40);
        if (termRef.current.rows !== targetRows) {
          termRef.current.resize(termRef.current.cols, targetRows);
        }
        termRef.current.write(formatted);
      } else {
        queueRef.current += formatted;
        processQueue();
      }
    } else {
      bufferRef.current += formatted;
    }
  }, [processQueue]);

  const clear = useCallback(() => {
    rowsCountRef.current = 5;
    queueRef.current = '';
    typingRef.current = false;
    if (termRef.current) {
      termRef.current.resize(termRef.current.cols, 5);
      termRef.current.clear();
    }
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const dispose = useCallback(() => {
    termRef.current?.dispose();
    termRef.current = null;
  }, []);

  return { init, write, clear, fit, dispose, term: termRef };
}
