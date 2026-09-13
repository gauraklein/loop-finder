/**
 * API service for communicating with the loop-finder backend
 */

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

export interface UploadFileResponse {
  task_id: string;
  status: string;
}

export interface AnalyzeUrlResponse {
  task_id: string;
  status: string;
}

export interface TaskStatus {
  task_id: string;
  status: string;
  file_path?: string;
  filename?: string;
  url?: string;
  bars?: string;
  top?: number;
  out_dir?: string;
  result?: {
    task_id: string;
    filename: string;
    file_path: string;
    analysis_complete: boolean;
    loops: Array<{
      id: string;
      filename: string;
      bars: number;
      rank: number;
      score: number;
      start_time: number;
      end_time: number;
      duration: number;
      preview_url: string;
    }>;
  };
  error?: string;
}

export const uploadFile = async (
  file: File,
  bars: string = "4,2",
  top: number = 5
): Promise<UploadFileResponse> => {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('bars', bars);
  formData.append('top', top.toString());

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  return response.json();
};

export const analyzeUrl = async (
  url: string,
  bars: string = "4,2",
  top: number = 5
): Promise<AnalyzeUrlResponse> => {
  const formData = new FormData();
  formData.append('url', url);
  formData.append('bars', bars);
  formData.append('top', top.toString());

  const response = await fetch(`${API_BASE_URL}/analyze-url`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`URL analysis failed: ${response.statusText}`);
  }

  return response.json();
};

export const getTaskStatus = async (task_id: string): Promise<TaskStatus> => {
  const response = await fetch(`${API_BASE_URL}/task/${task_id}`);

  if (!response.ok) {
    throw new Error(`Failed to fetch task status: ${response.statusText}`);
  }

  return response.json();
};

export const getLoopPreview = async (loop_id: string): Promise<string> => {
  // In a real implementation, this would return a blob URL or similar
  // For now, we'll return a placeholder
  return `${API_BASE_URL}/api/preview/${loop_id}`;
};