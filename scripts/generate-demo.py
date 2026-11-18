"""Create original synthetic preview media; never downloads or reads karaoke files."""
from pathlib import Path
import subprocess
import imageio_ffmpeg
from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parents[1] / '.test-instance' / 'media' / 'demo.mp4'
out.parent.mkdir(parents=True, exist_ok=True)
frame = out.with_suffix('.png')
image = Image.new('RGB', (960, 540), '#242131')
draw = ImageDraw.Draw(image)
for text, y, size, color in [('ISOLATED KARAOKE DEMO', 190, 42, 'white'), ('Synthetic tone - not a song recording', 270, 26, '#ffb978')]:
    try:
        font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', size)
    except OSError:
        font = ImageFont.load_default(size=size)
    draw.text((480, y), text, font=font, fill=color, anchor='mt')
image.save(frame)
subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), '-y', '-loop', '1', '-i', str(frame), '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=44100:duration=45', '-af', 'volume=0.08', '-t', '45', '-r', '24', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', '-shortest', str(out)], check=True)
print('Created synthetic demo media:', out)
