import { useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface DogearToggleProps {
  isSimpleView: boolean;
  onToggle: () => void;
}

export default function DogearToggle({ isSimpleView, onToggle }: DogearToggleProps) {
  const [isFlipping, setIsFlipping] = useState(false);

  const handleClick = () => {
    setIsFlipping(true);
    setTimeout(() => {
      onToggle();
      setTimeout(() => setIsFlipping(false), 600);
    }, 300);
  };

  return (
    <>
      {/* Small Round Button */}
      <button
        onClick={handleClick}
        className={`
          fixed bottom-6 right-6 z-[100]
          px-4 py-2 rounded-full
          bg-[rgb(var(--theme-primary))] hover:bg-[rgb(var(--theme-primary-dark))]
          text-white shadow-lg hover:shadow-xl
          flex items-center justify-center gap-2
          transition-all duration-200
          group text-sm
          ${isFlipping ? 'animate-spin-once' : ''}
        `}
        title={isSimpleView ? 'Switch to Full View' : 'Switch to Simple View'}
      >
        <RefreshCw className="size-4" />
        <span>{isSimpleView ? 'Full View' : 'Simple View'}</span>
      </button>

      {/* Page flip animation overlay */}
      {isFlipping && (
        <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ perspective: '2000px' }}>
          <div 
            className="absolute inset-0 bg-white origin-right shadow-2xl"
            style={{
              animation: 'pageFlip 0.6s ease-in-out',
              transformStyle: 'preserve-3d',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes pageFlip {
          0% {
            transform: rotateY(0deg);
            opacity: 1;
          }
          50% {
            transform: rotateY(-90deg);
            opacity: 0.8;
          }
          100% {
            transform: rotateY(-180deg);
            opacity: 0;
          }
        }

        .animate-spin-once {
          animation: spinOnce 0.6s ease-in-out;
        }

        @keyframes spinOnce {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </>
  );
}