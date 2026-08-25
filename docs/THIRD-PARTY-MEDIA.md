# Локальные медиаинструменты

MASHMAUET использует локальные FFmpeg/FFprobe и whisper.cpp только для чтения
видео и распознавания речи. Бинарные файлы и модель хранятся в `.local-tools/`
и не отправляются в GitHub.

Установка на новом компьютере выполняется один раз из PowerShell:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\setup-local-media.ps1
```

Скрипт загружает закреплённые версии и до установки проверяет SHA-256 каждого
файла. При несовпадении хэша установка останавливается.

Используемые сторонние проекты:

- FFmpeg static binaries `b6.1.1`: https://github.com/eugeneware/ffmpeg-static
- FFmpeg licensing: https://ffmpeg.org/legal.html
- whisper.cpp `v1.9.1`: https://github.com/ggml-org/whisper.cpp
- Whisper model files: https://huggingface.co/ggerganov/whisper.cpp

Перед распространением MASHMAUET вместе с бинарными файлами необходимо отдельно
проверить применимые условия лицензий. Обычный Git-клон бинарники не содержит.
