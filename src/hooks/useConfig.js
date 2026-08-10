import { useState, useEffect } from 'react'
import { getConfig, subscribeConfig } from '../store/appConfig.js'

export function useConfig() {
  const [config, setConfig] = useState(getConfig)

  useEffect(() => {
    const unsub = subscribeConfig(setConfig)
    return unsub
  }, [])

  return config
}
