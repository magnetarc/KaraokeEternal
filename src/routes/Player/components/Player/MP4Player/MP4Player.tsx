import React from 'react'
import styles from './MP4Player.css'
import MediaCompletion from 'lib/MediaCompletion'

interface MP4PlayerProps {
  isPlaying: boolean
  mediaId: number
  mediaKey: number
  mediaReplayKey?: number
  mediaSrc?: string | null
  width: number
  height: number
  onAudioElement(video: HTMLVideoElement): void
  // media events
  onEnd(): void
  onError(error: string): void
  onLoad(): void
  onPlay(): void
  onStatus(status: { position: number }): void
}

class MP4Player extends React.Component<MP4PlayerProps> {
  video = React.createRef<HTMLVideoElement>()
  completion: MediaCompletion | null = null

  componentDidMount () {
    this.completion = new MediaCompletion(this.video.current, () => this.props.onEnd())
    this.props.onAudioElement(this.video.current)
    this.updateSources()
  }

  componentDidUpdate (prevProps: MP4PlayerProps) {
    // mediaSrc resolves asynchronously, so it can arrive after the mediaKey change
    if (prevProps.mediaKey !== this.props.mediaKey || prevProps.mediaSrc !== this.props.mediaSrc) {
      this.updateSources()
      return
    }

    if (prevProps.mediaReplayKey !== this.props.mediaReplayKey) {
      this.completion.reset()
      this.video.current.currentTime = 0
      this.completion.start()
      this.updateIsPlaying()
      return
    }

    if (prevProps.isPlaying !== this.props.isPlaying) {
      this.updateIsPlaying()
    }
  }

  render () {
    const { width, height } = this.props

    return (
      <video
        className={styles.video}
        preload='auto'
        width={width}
        height={height}
        onCanPlayThrough={this.updateIsPlaying}
        onCanPlay={this.updateIsPlaying}
        onError={this.handleError}
        onPlay={this.handlePlay}
        onTimeUpdate={this.handleTimeUpdate}
        ref={this.video}
      />
    )
  }

  updateSources = () => {
    if (!this.video.current) return
    this.completion?.reset()
    this.video.current.pause()
    this.props.onLoad()

    // src is still being resolved; we'll be called again once it is
    if (!this.props.mediaSrc) return

    this.video.current.src = this.props.mediaSrc
    this.video.current.load()
    this.completion.start()
  }

  updateIsPlaying = () => {
    if (!this.video.current) return

    if (this.props.isPlaying) {
      this.video.current.play()
        .catch((err) => { if (err.name !== 'AbortError' && this.props.isPlaying) this.props.onError(err.message) })
    } else {
      this.video.current.pause()
    }
  }

  /*
  * <video> event handlers
  */
  handleError = () => {
    const { message, code } = this.video.current.error
    this.props.onError(`${message} (code ${code})`)
  }

  handlePlay = () => this.props.onPlay()

  componentWillUnmount () {
    this.completion?.destroy()
    this.video.current?.pause()
  }

  handleTimeUpdate = () => {
    if (!this.video.current) return

    this.props.onStatus({
      position: this.video.current.currentTime,
    })
  }
}

export default MP4Player
