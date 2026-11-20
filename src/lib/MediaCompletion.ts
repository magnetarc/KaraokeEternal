/** Completion is based on the media engine, never imported track duration. */
export default class MediaCompletion {
  private armed = false
  private finished = false
  private timer: ReturnType<typeof setInterval>
  constructor (private media: HTMLMediaElement, private onEnd: () => void) {
    media.addEventListener('ended', this.check)
    media.addEventListener('pause', this.check)
    media.addEventListener('timeupdate', this.check)
    // Some embedded browsers miss the event while the render thread is busy.
    this.timer = setInterval(this.check, 500)
  }

  start () {
    this.finished = false
    this.armed = true
  }

  reset () { this.armed = false }
  finish = () => {
    if (!this.armed || this.finished) return
    this.finished = true
    this.onEnd()
  }

  check = () => { if (this.media.ended && !this.media.seeking) this.finish() }
  destroy () {
    this.reset()
    clearInterval(this.timer)
    this.media.removeEventListener('ended', this.check)
    this.media.removeEventListener('pause', this.check)
    this.media.removeEventListener('timeupdate', this.check)
  }
}
