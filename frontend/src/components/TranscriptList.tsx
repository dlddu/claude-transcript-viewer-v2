import { TranscriptFile } from '../types';

interface TranscriptListProps {
  files: TranscriptFile[];
  onSelect: (file: TranscriptFile) => void;
}

export function TranscriptList({ files, onSelect }: TranscriptListProps) {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date: Date | string): string => {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleString();
  };

  return (
    <div data-testid="transcript-list">
      {files.map((file) => (
        <div
          key={file.key}
          data-testid="transcript-item"
          data-key={file.key}
          onClick={() => onSelect(file)}
          style={{
            padding: '12px',
            margin: '8px 0',
            border: '1px solid #ddd',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          <div data-testid="transcript-filename" style={{ fontWeight: 'bold' }}>
            {file.key}
          </div>
          <div data-testid="transcript-size" style={{ fontSize: '0.9em', color: '#666' }}>
            Size: {formatSize(file.size)}
          </div>
          <div data-testid="transcript-date" style={{ fontSize: '0.9em', color: '#666' }}>
            Modified: {formatDate(file.lastModified)}
          </div>
        </div>
      ))}
    </div>
  );
}
