import React, { useRef, useEffect, useState } from 'react'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Box from '@mui/material/Box'

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [imgSize, setImgSize] = useState({ w: 0, h: 0, depth: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    canvas.width = 800
    canvas.height = 600
    ctx.fillStyle = '#555'
    ctx.fillRect(0,0,canvas.width,canvas.height)
  }, [])

  return (
    <Box sx={{height: '100vh', display: 'flex', flexDirection: 'column'}}>
      <AppBar position="static">
        <Toolbar>
          <Typography variant="h6" component="div" sx={{flexGrow: 1}}>Графический редактор</Typography>
          <Button color="inherit">Открыть</Button>
          <Button color="inherit">Сохранить</Button>
        </Toolbar>
      </AppBar>

      <Container sx={{flex: 1, py:2}}>
        <canvas ref={canvasRef} className="main-canvas" style={{maxWidth: '100%', height: 'auto', borderRadius: 4}} />
      </Container>

      <Box component="footer" sx={{py:1, px:2, bgcolor: '#f5f5f5', borderTop: '1px solid #ddd'}}>
        Размер: {imgSize.w}×{imgSize.h} — Глубина: {imgSize.depth}
      </Box>
    </Box>
  )
}
