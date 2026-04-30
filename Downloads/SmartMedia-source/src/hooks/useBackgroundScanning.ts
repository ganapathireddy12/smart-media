import { useEffect, useRef } from 'react'
import { useAppStore, ImageMetadata } from '../store/appStore'

export function useBackgroundScanning() {
  const discoveredImages = useAppStore((state) => state.discoveredImages)
  const scanProgress = useAppStore((state) => state.scanProgress)
  const setScanProgress = useAppStore((state) => state.setScanProgress)
  const addImages = useAppStore((state) => state.addImages)
  const autoCategorizImages = useAppStore((state) => state.autoCategorizImages)
  const images = useAppStore((state) => state.images)

  const isProcessingRef = useRef(false)
  const hasStartedRef = useRef(false)

  useEffect(() => {
    // Only run when status is 'scanning' and not already processing
    if (scanProgress.status !== 'scanning') {
      hasStartedRef.current = false
      return
    }
    if (isProcessingRef.current) return
    if (discoveredImages.length === 0) return

    // Only start processing once per scan session
    if (hasStartedRef.current) return

    const processAllImages = async () => {
      if (isProcessingRef.current) return

      isProcessingRef.current = true
      hasStartedRef.current = true
      let cancelled = false
      let skippedCount = 0
      let processedCount = 0

      try {
        // Get existing image filenames for duplicate detection
        const existingFilenames = new Set(images.map(img => img.filename))

        // Process each image in the array using for...of loop
        for (let i = 0; i < discoveredImages.length; i++) {
          if (cancelled) break

          // Check if still in scanning status
          const currentStatus = useAppStore.getState().scanProgress.status
          if (currentStatus !== 'scanning') {
            cancelled = true
            break
          }

          // Check if user skipped this image
          const currentProgress = useAppStore.getState().scanProgress
          if (currentProgress.skipped && currentProgress.current === i + 1) {
            console.log(`[Scanning] Skipped ${i + 1}/${discoveredImages.length}`)
            // Reset skipped flag and continue to next image
            setScanProgress({ skipped: false })
            await new Promise(resolve => setTimeout(resolve, 300))
            continue
          }

          const imagePath = discoveredImages[i]
          if (!imagePath) continue

          const filename = imagePath.split('\\').pop() || imagePath.split('/').pop() || 'image.jpg'

          // Check if image already exists by filename (prevent duplicates)
          if (existingFilenames.has(filename)) {
            console.log(`[Scanning] Skipping duplicate ${i + 1}/${discoveredImages.length}: ${filename}`)
            skippedCount++

            // Update progress for UI display
            setScanProgress({
              current: i + 1,
              currentImage: `${filename} (already scanned)`,
              detectedObjects: [],
              generatedCaption: 'Skipped - already in gallery',
              detectedFaces: 0,
            })

            // Small delay for UI feedback
            await new Promise(resolve => setTimeout(resolve, 300))
            continue
          }

          // Detect media type for display
          const ext = filename.split('.').pop()?.toLowerCase() || ''
          const videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', 'wmv', 'flv', 'm4v', '3gp']
          const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a', 'wma', 'opus']
          const isVideo = videoExts.includes(ext)
          const isAudio = audioExts.includes(ext)
          const mediaLabel = isVideo ? '🎬 Processing video...' : isAudio ? '🎵 Processing audio...' : 'Processing...'

          // Update progress for UI display
          setScanProgress({
            current: i,
            currentImage: filename,
            detectedObjects: [],
            generatedCaption: mediaLabel,
            detectedFaces: 0,
          })

          try {
            console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
            console.log(`📸 [Scanning] Processing ${i + 1}/${discoveredImages.length}`)
            console.log(`   File: ${filename}`)
            console.log(`   Path: ${imagePath}`)
            console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

            // Get thumbnail (skip for audio; attempt for image/video)
            let thumbnail: string | undefined
            if (!isAudio) {
              try {
                console.log(`🖼️  [Scanning] Loading thumbnail...`)
                const preview = await window.electronAPI?.getImageThumbnail(imagePath)
                if (preview) {
                  thumbnail = preview
                  console.log(`✅ [Scanning] Thumbnail loaded`)
                } else {
                  console.log(`⚠️  [Scanning] No thumbnail returned`)
                }
              } catch (error) {
                console.error('❌ [Scanning] Error loading preview:', error)
              }
            }

            // Process image using AI backend
            console.log(`\n🤖 [Scanning] Calling AI engine...`)
            console.log(`   API Available:`, !!window.electronAPI)
            console.log(`   processImage Available:`, !!window.electronAPI?.processImage)
            
            const aiResult = await window.electronAPI?.processImage(imagePath)
            
            console.log(`\n📊 [Scanning] AI Result Received:`)
            console.log(`   Success:`, aiResult?.success)
            console.log(`   Caption:`, aiResult?.caption?.substring(0, 60) + '...')
            console.log(`   Objects:`, aiResult?.objects?.length)
            console.log(`   Photo Type:`, aiResult?.photo_type)
            console.log(aiResult)

            if (!aiResult) {
              console.error('[Scanning] No response from AI engine')
              setScanProgress({ current: i + 1, currentImage: filename, generatedCaption: 'No response from engine' })
              skippedCount++
              continue
            }

            if (!aiResult.success) {
              console.error('[Scanning] AI processing failed:', aiResult.error || 'Unknown error')
              console.error('[Scanning] Skipping image:', filename)
              setScanProgress({ current: i + 1, currentImage: filename, generatedCaption: `Skipped: ${aiResult.error || 'failed'}` })
              skippedCount++
              continue
            }

            if (aiResult && aiResult.success) {
              // Use actual AI results with comprehensive extraction
              const objects = aiResult.objects || []
              const caption = aiResult.caption || 'An image'
              const detailedCaption = aiResult.detailed_caption || { main: caption, scene: '', details: '', full: caption }
              const fullCaption = detailedCaption.full || caption
              const tags = aiResult.tags || objects
              const faceCount = aiResult.face_count || (typeof aiResult.faces === 'number' ? aiResult.faces : 0)
              const characters = aiResult.characters || []
              const scene = aiResult.scene || { scene: 'unknown', confidence: 0 }
              const emotion = aiResult.emotion || undefined
              const fileType = aiResult.file_type || undefined

              // NEW: Extract comprehensive AI data
              const extractedText = aiResult.extracted_text || null
              const animals = aiResult.animals || null
              const peopleDetails = aiResult.people_details || null
              const activities = aiResult.activities || null
              const colors = aiResult.colors || null
              const additionalDetails = aiResult.additional_details || null

              // Update progress display with AI results
              setScanProgress({
                current: i + 1,
                currentImage: filename,
                detectedObjects: objects,
                generatedCaption: fullCaption,
                detectedFaces: faceCount,
              })

              // Create image metadata with comprehensive AI results
              const pathHash = imagePath.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0).toString(16)
              const metadata: ImageMetadata = {
                id: `img-${pathHash}-${Date.now()}-${i}`,
                path: imagePath,
                filename,
                thumbnail,
                tags: tags,
                caption: fullCaption,
                detailedCaption,
                objects,
                faces: faceCount,
                scene: scene.scene,
                emotion: emotion,
                fileType: fileType,
                imageHash: aiResult.image_hash, // Store MD5 hash for duplicate detection
                // CRITICAL: Include media_type from AI result (video/audio/image)
                mediaType: aiResult.media_type || 'image',
                media_type: aiResult.media_type || 'image', // Add snake_case for backend compatibility
                duration: aiResult.duration || undefined,
                file_size: aiResult.file_size || undefined,
                // NEW: Add comprehensive extracted data
                extractedText,
                animals,
                peopleDetails,
                activities,
                colors,
                additionalDetails,
                // CRITICAL: Include full metadata from AI (contains GPS, Make, Model, album_category)
                metadata: {
                  ...aiResult.metadata,
                  album_category: aiResult.album_category || 'Others',
                  thumbnail_path: aiResult.thumbnail || undefined
                },
                dateScanned: new Date().toISOString(),
                dateModified: new Date().toISOString(),
              }

              // *** CHANGED: Add image immediately to gallery ***
              console.log(`[Scanning] Adding image ${processedCount + 1} to gallery immediately: ${filename}`)

              // Persist to database via Electron Main Process
              try {
                await window.electronAPI.saveImageMetadata(metadata)
              } catch (dbError) {
                console.error('[Scanning] Failed to save metadata to DB:', dbError)
              }

              addImages([metadata])
              autoCategorizImages([metadata])
              processedCount++

              // Add to existing filenames set to prevent duplicates
              existingFilenames.add(filename)
            } else {
              console.error('AI processing failed:', aiResult?.error)
            }
          } catch (error) {
            console.error('Error processing image:', error)
            setScanProgress({ current: i + 1, currentImage: filename, generatedCaption: 'Error during processing' })
            skippedCount++
          }
        }

        console.log(`[Scanning] Completed! Processed ${processedCount} new images, skipped ${skippedCount} duplicates`)

        // Mark scan as completed
        setScanProgress({
          current: discoveredImages.length,
          status: 'completed',
          currentImage: '',
        })

      } finally {
        isProcessingRef.current = false
      }
    }

    processAllImages()
  }, [scanProgress.status, discoveredImages])

  return {
    isScanning: scanProgress.status === 'scanning',
    isPaused: scanProgress.status === 'paused',
    progress: scanProgress.total > 0 ? (scanProgress.current / scanProgress.total) * 100 : 0,
    current: scanProgress.current,
    total: scanProgress.total,
  }
}
