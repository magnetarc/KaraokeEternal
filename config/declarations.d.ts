declare module '*.css' {
  const classes: { [key: string]: string }
  export = classes
}

declare module '*.webp' {
  const url: string
  export default url
}

interface Window {
  webkitAudioContext: typeof AudioContext
}

declare const module: {
  hot?: {
    accept(path: string, callback: () => Promise<void> | void): void
  }
}
