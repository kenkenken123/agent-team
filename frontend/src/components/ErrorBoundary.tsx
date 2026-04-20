import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Result, Button } from 'antd';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Result
            status="error"
            title="页面出错了"
            subTitle={this.state.error?.message || "发生了一个意外错误，请尝试刷新页面。"}
            extra={[
              <Button type="primary" key="refresh" onClick={() => window.location.reload()}>
                刷新页面
              </Button>,
              <Button key="back" onClick={() => this.setState({ hasError: false })}>
                尝试继续
              </Button>
            ]}
          />
        </div>
      );
    }

    return this.props.children;
  }
}
