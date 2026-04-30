import { motion } from 'framer-motion'

interface SkeletonLoaderProps {
  count?: number
  type?: 'masonry' | 'grid' | 'card' | 'list'
  className?: string
}

export default function SkeletonLoader({ count = 6, type = 'masonry', className = '' }: SkeletonLoaderProps) {
  const skeletons = Array.from({ length: count }, (_, i) => i)

  if (type === 'masonry') {
    return (
      <div className={`masonry-grid ${className}`}>
        {skeletons.map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.05 }}
            className="mb-3"
          >
            <div className="skeleton-card" style={{ height: `${200 + Math.random() * 150}px` }}>
              <div className="skeleton-shimmer" />
            </div>
          </motion.div>
        ))}
      </div>
    )
  }

  if (type === 'grid') {
    return (
      <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 ${className}`}>
        {skeletons.map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="skeleton-card aspect-square">
              <div className="skeleton-shimmer" />
            </div>
          </motion.div>
        ))}
      </div>
    )
  }

  if (type === 'card') {
    return (
      <div className={`space-y-4 ${className}`}>
        {skeletons.map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="skeleton-card h-24"
          >
            <div className="skeleton-shimmer" />
          </motion.div>
        ))}
      </div>
    )
  }

  if (type === 'list') {
    return (
      <div className={`space-y-3 ${className}`}>
        {skeletons.map((i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="skeleton-card h-16"
          >
            <div className="skeleton-shimmer" />
          </motion.div>
        ))}
      </div>
    )
  }

  return null
}

// Image skeleton component with fade-in on load
export function ImageSkeleton({ src, alt, className = '', onLoad }: { src: string; alt: string; className?: string; onLoad?: () => void }) {
  return (
    <div className={`relative ${className}`}>
      <div className="skeleton-card absolute inset-0">
        <div className="skeleton-shimmer" />
      </div>
      <motion.img
        src={src}
        alt={alt}
        className={`${className} relative z-10`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
        onLoad={onLoad}
        loading="lazy"
      />
    </div>
  )
}
