import React from 'react';
import { ImageData } from '../../../types';

interface ImageAttachmentProps {
    images: ImageData[];
    onRemove: (index: number) => void;
}

export const ImageAttachment: React.FC<ImageAttachmentProps> = ({ images, onRemove }) => {
    if (!images.length) return null;

    return (
        <div className="markdown-next-ai-image-previews" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', padding: '0 10px 8px 10px' }}>
            {images.map((img, index) => (
                <div key={index} style={{ position: 'relative', width: '60px', height: '60px' }}>
                    <img 
                        src={img.base64 || img.url} 
                        style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--mn-border)' }} 
                    />
                    <button
                        onClick={() => onRemove(index)}
                        style={{
                            position: 'absolute',
                            top: '-6px',
                            right: '-6px',
                            width: '16px',
                            height: '16px',
                            borderRadius: '50%',
                            background: 'var(--text-error, #d32f2f)',
                            color: 'white',
                            border: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            fontSize: '12px',
                            padding: 0
                        }}
                    >
                        ×
                    </button>
                </div>
            ))}
        </div>
    );
};
