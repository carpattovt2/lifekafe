'use client'

import { useEffect, useState } from 'react'

type Weather = {
  temp: number
  windspeed: number
  weathercode: number
  time: string
}

function describeCode(code: number): string {
  if (code === 0) return 'Clear sky'
  if (code <= 3) return 'Partly cloudy'
  if (code <= 9) return 'Foggy'
  if (code <= 19) return 'Drizzle'
  if (code <= 29) return 'Rain'
  if (code <= 39) return 'Snow'
  if (code <= 49) return 'Fog'
  if (code <= 59) return 'Drizzle'
  if (code <= 69) return 'Rain'
  if (code <= 79) return 'Snow'
  if (code <= 84) return 'Rain showers'
  if (code <= 94) return 'Thunderstorm'
  return 'Storm'
}

function iconForCode(code: number): string {
  if (code === 0) return '☀'
  if (code <= 3) return '⛅'
  if (code <= 49) return '🌫'
  if (code <= 69) return '🌧'
  if (code <= 79) return '❄'
  if (code <= 84) return '🌦'
  return '⛈'
}

export default function WeatherWidget() {
  const [weather, setWeather] = useState<Weather | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('https://api.open-meteo.com/v1/forecast?latitude=40.7128&longitude=-74.0060&current_weather=true')
      .then(r => r.json())
      .then(data => {
        const cw = data.current_weather
        setWeather({
          temp: Math.round(cw.temperature),
          windspeed: Math.round(cw.windspeed),
          weathercode: cw.weathercode,
          time: cw.time,
        })
      })
      .catch(() => setError(true))
  }, [])

  return (
    <div className="pixel-card card-dash">
      <div className="widget-label" style={{ color: 'var(--c-dash)' }}>
        ☁ WEATHER — NEW YORK
      </div>
      {error && <div style={{ color: 'var(--muted)', fontSize: '16px' }}>Unavailable</div>}
      {!weather && !error && <div style={{ color: 'var(--muted)', fontSize: '16px' }}>Loading...</div>}
      {weather && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '40px', lineHeight: 1 }}>{iconForCode(weather.weathercode)}</span>
            <div>
              <div style={{
                fontFamily: "'Inter', sans-serif",
                fontSize: '22px',
                color: 'var(--text)',
                marginBottom: '4px',
              }}>
                {weather.temp}°C
              </div>
              <div style={{ color: 'var(--muted)', fontSize: '18px' }}>
                {describeCode(weather.weathercode)}
              </div>
            </div>
          </div>
          <div style={{ color: 'var(--muted)', fontSize: '16px' }}>
            Wind: {weather.windspeed} km/h
          </div>
        </>
      )}
    </div>
  )
}
