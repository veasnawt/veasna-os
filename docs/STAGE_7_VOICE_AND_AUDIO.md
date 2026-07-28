# Stage 7: Voice, Speech & Ambient Audio Engine Specification

---

## 🎙️ Stage 7 Architecture Overview

Stage 7 equips Rixie with a **Real-Time Voice, Speech, & Ambient Audio Engine**, turning Rixie into a hands-free voice companion across all studios with zero-latency speech recognition, persona voice synthesis, and audio stem analysis:

```
                          ┌────────────────────────────────┐
                          │    STAGE 7 VOICE & AUDIO OS    │
                          └───────────────┬───────────────┘
                                          │
            ┌─────────────────────────────┼─────────────────────────────┐
            │                             │                             │
    ┌───────▼───────┐             ┌───────▼───────┐             ┌───────▼───────┐
    │  STT & VAD    │             │ TTS VOICE     │             │ AMBIENT AUDIO │
    │ INPUT ENGINE  │             │ SYNTHESIS     │             │ ANALYSIS      │
    │(Whisper, VAD) │             │ (ElevenLabs)  │             │ (BPM, Pitch)  │
    └───────────────┘             └───────────────┘             └───────────────┘
```

---

## 1. Speech-to-Text (STT) & Voice Input Engine

- `voice_start_listening`: Activates microphone stream with Voice Activity Detection (VAD).
- `voice_transcribe_audio`: Transcribes spoken voice input into text using local Whisper or cloud STT models.
- **Wake-Word Detection**: Listens passively for wake phrase ("Hey Rixie") with low CPU overhead.

---

## 2. Text-to-Speech (TTS) Persona Voice Engine

- `voice_synthesize_speech`: Converts text responses into spoken audio using ElevenLabs or Coqui TTS.
- **Persona Voice Tuning**: Rixie's voice profile is tuned to be articulate, warm, calm, and clear.
- **Audio Ducking**: Automatically lowers background studio audio output when Rixie is speaking.

---

## 3. Ambient Audio & Music Analysis Tools

- `audio_detect_bpm_pitch`: Analyzes music track stems for BPM, musical key, and harmonic spectrum.
- `audio_transcribe_lyrics`: Transcribes audio singing into aligned lyric text specs.

---

## 4. Hands-Free Studio Voice Control

Enables hands-free voice commands while editing in BP Studio, Art, Music, or Game Dev:
- *"Rixie, lower the background scoring by 3 decibels."*
- *"Rixie, switch provider to Claude 3.7."*
- *"Rixie, save this color palette to Art Studio memory."*
