import { afterEach, describe, expect, it, vi } from 'vitest'
import MediaCompletion from './MediaCompletion'
class Media extends EventTarget { ended = false; seeking = false; paused = false; currentTime = 0; duration = 10 }
afterEach(() => vi.useRealTimers())
describe('media completion', () => {
  it('recovers a missed ended event from the native ended flag, once only', () => {
    vi.useFakeTimers()
    const media = new Media()
    const done = vi.fn()
    const guard = new MediaCompletion(media as unknown as HTMLMediaElement, done)
    guard.start()
    media.ended = true
    vi.advanceTimersByTime(1000)
    media.dispatchEvent(new Event('ended'))
    expect(done).toHaveBeenCalledTimes(1)
    guard.destroy()
  })
  it('does not skip paused, buffering or seeking media based on a duration estimate', () => {
    vi.useFakeTimers()
    const media = new Media()
    const done = vi.fn()
    const guard = new MediaCompletion(media as unknown as HTMLMediaElement, done)
    guard.start()
    media.paused = true
    media.currentTime = 10
    media.dispatchEvent(new Event('pause'))
    vi.advanceTimersByTime(5000)
    expect(done).not.toHaveBeenCalled()
    media.ended = true
    media.seeking = true
    vi.advanceTimersByTime(1000)
    expect(done).not.toHaveBeenCalled()
    guard.destroy()
  })
  it('ignores stale ended events while switching sources, and can complete a replay', () => {
    vi.useFakeTimers()
    const media = new Media()
    const done = vi.fn()
    const guard = new MediaCompletion(media as unknown as HTMLMediaElement, done)
    guard.start()
    media.ended = true
    media.dispatchEvent(new Event('ended'))
    expect(done).toHaveBeenCalledTimes(1)
    guard.reset()
    vi.advanceTimersByTime(500)
    expect(done).toHaveBeenCalledTimes(1)
    media.ended = false
    guard.start()
    media.dispatchEvent(new Event('ended'))
    expect(done).toHaveBeenCalledTimes(1)
    media.ended = true
    media.dispatchEvent(new Event('timeupdate'))
    expect(done).toHaveBeenCalledTimes(2)
    guard.destroy()
    vi.advanceTimersByTime(1000)
    expect(done).toHaveBeenCalledTimes(2)
  })
})
