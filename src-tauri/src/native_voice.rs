use serde::Serialize;
use std::sync::Arc;
use std::sync::Mutex as StdMutex;
use std::time::Instant;

const NATIVE_VOICE_TARGET_SAMPLE_RATE_HZ: u32 = 16_000;

struct NativeVoiceCaptureSession {
    stream: cpal::Stream,
    samples_mono_i16: Arc<StdMutex<Vec<i16>>>,
    input_sample_rate_hz: u32,
    started_at: Instant,
}

#[derive(Clone, Copy, Debug)]
struct NativeVoiceSignalMetrics {
    rms: f32,
    peak: i16,
    speech_ratio: f32,
}

#[derive(Serialize)]
pub(crate) struct NativeVoiceCaptureStarted {
    input_sample_rate_hz: u32,
}

#[derive(Serialize)]
pub(crate) struct NativeVoiceCaptureStopped {
    audio_base64: String,
    mime_type: String,
    sample_rate_hz: u32,
    duration_ms: u64,
    rms: f32,
    peak: i16,
    speech_ratio: f32,
    speech_detected: bool,
}

pub(crate) enum NativeVoiceWorkerCommand {
    Start {
        reply: std::sync::mpsc::Sender<Result<NativeVoiceCaptureStarted, String>>,
    },
    Stop {
        reply: std::sync::mpsc::Sender<Result<NativeVoiceCaptureStopped, String>>,
    },
    Cancel {
        reply: std::sync::mpsc::Sender<Result<bool, String>>,
    },
}

#[derive(Clone)]
pub(crate) struct NativeVoiceCaptureManager {
    pub(crate) sender: std::sync::mpsc::Sender<NativeVoiceWorkerCommand>,
}

impl Default for NativeVoiceCaptureManager {
    fn default() -> Self {
        let (sender, receiver) = std::sync::mpsc::channel::<NativeVoiceWorkerCommand>();
        let _ = std::thread::Builder::new()
            .name("native-voice-capture".to_string())
            .spawn(move || native_voice_worker_loop(receiver));
        Self { sender }
    }
}

fn f32_sample_to_i16(sample: f32) -> i16 {
    let clamped = sample.clamp(-1.0, 1.0);
    let scaled = if clamped < 0.0 {
        (clamped * 32768.0).round()
    } else {
        (clamped * 32767.0).round()
    };
    scaled.clamp(i16::MIN as f32, i16::MAX as f32) as i16
}

fn mix_frame_f32_to_i16(frame: &[f32]) -> i16 {
    if frame.is_empty() {
        return 0;
    }
    let mut sum = 0.0f32;
    for sample in frame {
        sum += sample.clamp(-1.0, 1.0);
    }
    f32_sample_to_i16(sum / frame.len() as f32)
}

fn mix_frame_i16_to_i16(frame: &[i16]) -> i16 {
    if frame.is_empty() {
        return 0;
    }
    let sum: i64 = frame.iter().map(|sample| *sample as i64).sum();
    let avg = (sum as f64 / frame.len() as f64)
        .round()
        .clamp(i16::MIN as f64, i16::MAX as f64);
    avg as i16
}

fn mix_frame_u16_to_i16(frame: &[u16]) -> i16 {
    if frame.is_empty() {
        return 0;
    }
    let mut sum = 0i64;
    for sample in frame {
        sum += *sample as i64 - 32768;
    }
    let avg = (sum as f64 / frame.len() as f64)
        .round()
        .clamp(i16::MIN as f64, i16::MAX as f64);
    avg as i16
}

fn push_mono_i16_from_f32(data: &[f32], channels: usize, sink: &Arc<StdMutex<Vec<i16>>>) {
    if channels == 0 {
        return;
    }
    if let Ok(mut guard) = sink.lock() {
        for frame in data.chunks(channels) {
            guard.push(mix_frame_f32_to_i16(frame));
        }
    }
}

fn push_mono_i16_from_i16(data: &[i16], channels: usize, sink: &Arc<StdMutex<Vec<i16>>>) {
    if channels == 0 {
        return;
    }
    if let Ok(mut guard) = sink.lock() {
        for frame in data.chunks(channels) {
            guard.push(mix_frame_i16_to_i16(frame));
        }
    }
}

fn push_mono_i16_from_u16(data: &[u16], channels: usize, sink: &Arc<StdMutex<Vec<i16>>>) {
    if channels == 0 {
        return;
    }
    if let Ok(mut guard) = sink.lock() {
        for frame in data.chunks(channels) {
            guard.push(mix_frame_u16_to_i16(frame));
        }
    }
}

fn encode_wav_pcm16_mono(samples: &[i16], sample_rate_hz: u32) -> Vec<u8> {
    let data_size = (samples.len() * std::mem::size_of::<i16>()) as u32;
    let mut out = Vec::with_capacity(44 + data_size as usize);
    out.extend_from_slice(b"RIFF");
    out.extend_from_slice(&(36u32 + data_size).to_le_bytes());
    out.extend_from_slice(b"WAVE");
    out.extend_from_slice(b"fmt ");
    out.extend_from_slice(&16u32.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&1u16.to_le_bytes());
    out.extend_from_slice(&sample_rate_hz.to_le_bytes());
    let byte_rate = sample_rate_hz * 2;
    out.extend_from_slice(&byte_rate.to_le_bytes());
    out.extend_from_slice(&2u16.to_le_bytes());
    out.extend_from_slice(&16u16.to_le_bytes());
    out.extend_from_slice(b"data");
    out.extend_from_slice(&data_size.to_le_bytes());
    for sample in samples {
        out.extend_from_slice(&sample.to_le_bytes());
    }
    out
}

fn resample_linear_mono_i16(input: &[i16], from_rate_hz: u32, to_rate_hz: u32) -> Vec<i16> {
    if input.is_empty() || from_rate_hz == 0 || to_rate_hz == 0 {
        return Vec::new();
    }
    if from_rate_hz == to_rate_hz {
        return input.to_vec();
    }
    let ratio = from_rate_hz as f64 / to_rate_hz as f64;
    let out_len = ((input.len() as f64) * (to_rate_hz as f64) / (from_rate_hz as f64))
        .round()
        .max(1.0) as usize;
    let mut out = Vec::with_capacity(out_len);
    for idx in 0..out_len {
        let src_pos = idx as f64 * ratio;
        let left = src_pos.floor() as usize;
        let right = (left + 1).min(input.len().saturating_sub(1));
        let frac = (src_pos - left as f64) as f32;
        let a = input[left] as f32;
        let b = input[right] as f32;
        out.push(
            (a + (b - a) * frac)
                .round()
                .clamp(i16::MIN as f32, i16::MAX as f32) as i16,
        );
    }
    out
}

fn analyze_voice_signal(samples: &[i16]) -> NativeVoiceSignalMetrics {
    if samples.is_empty() {
        return NativeVoiceSignalMetrics {
            rms: 0.0,
            peak: 0,
            speech_ratio: 0.0,
        };
    }
    let mut sum_sq = 0.0f64;
    let mut peak = 0i16;
    let mut voiced_samples = 0usize;
    for sample in samples {
        let normalized = (*sample as f32 / 32768.0).abs();
        sum_sq += f64::from(normalized * normalized);
        if normalized > 0.015 {
            voiced_samples += 1;
        }
        let abs_i32 = (*sample as i32).abs();
        if abs_i32 > peak as i32 {
            peak = abs_i32.min(i16::MAX as i32) as i16;
        }
    }
    NativeVoiceSignalMetrics {
        rms: (sum_sq / samples.len() as f64).sqrt() as f32,
        peak,
        speech_ratio: voiced_samples as f32 / samples.len() as f32,
    }
}

fn detect_speech(samples: &[i16], sample_rate_hz: u32, metrics: NativeVoiceSignalMetrics) -> bool {
    let min_samples = (sample_rate_hz as usize / 5).max(800);
    if samples.len() < min_samples {
        return false;
    }
    metrics.rms >= 0.007 || metrics.speech_ratio >= 0.012 || metrics.peak >= 900
}

fn start_native_capture_session(
    session: &mut Option<NativeVoiceCaptureSession>,
) -> Result<NativeVoiceCaptureStarted, String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    use cpal::{SampleFormat, StreamConfig};

    if session.is_some() {
        return Err("Voice capture is already active.".to_string());
    }

    let host = cpal::default_host();
    let device = host
        .default_input_device()
        .ok_or_else(|| "No microphone input device available.".to_string())?;
    let supported = device
        .default_input_config()
        .map_err(|e| format!("Could not read microphone config: {e}"))?;

    let stream_config: StreamConfig = supported.clone().into();
    let input_channels = stream_config.channels.max(1) as usize;
    let input_sample_rate_hz = stream_config.sample_rate.0;
    let samples_mono_i16 = Arc::new(StdMutex::new(Vec::with_capacity(
        input_sample_rate_hz as usize * 30,
    )));

    let stream = match supported.sample_format() {
        SampleFormat::F32 => {
            let sink = Arc::clone(&samples_mono_i16);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[f32], _| push_mono_i16_from_f32(data, input_channels, &sink),
                    |error| eprintln!("[voice-native] stream error: {error}"),
                    None,
                )
                .map_err(|e| format!("Could not start microphone stream (f32): {e}"))?
        }
        SampleFormat::I16 => {
            let sink = Arc::clone(&samples_mono_i16);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[i16], _| push_mono_i16_from_i16(data, input_channels, &sink),
                    |error| eprintln!("[voice-native] stream error: {error}"),
                    None,
                )
                .map_err(|e| format!("Could not start microphone stream (i16): {e}"))?
        }
        SampleFormat::U16 => {
            let sink = Arc::clone(&samples_mono_i16);
            device
                .build_input_stream(
                    &stream_config,
                    move |data: &[u16], _| push_mono_i16_from_u16(data, input_channels, &sink),
                    |error| eprintln!("[voice-native] stream error: {error}"),
                    None,
                )
                .map_err(|e| format!("Could not start microphone stream (u16): {e}"))?
        }
        _ => return Err("Unsupported microphone sample format.".to_string()),
    };

    stream
        .play()
        .map_err(|e| format!("Could not activate microphone stream: {e}"))?;

    *session = Some(NativeVoiceCaptureSession {
        stream,
        samples_mono_i16,
        input_sample_rate_hz,
        started_at: Instant::now(),
    });

    Ok(NativeVoiceCaptureStarted {
        input_sample_rate_hz,
    })
}

fn stop_native_capture_session(
    session: &mut Option<NativeVoiceCaptureSession>,
) -> Result<NativeVoiceCaptureStopped, String> {
    use base64::{engine::general_purpose::STANDARD, Engine as _};

    let active = session
        .take()
        .ok_or_else(|| "Voice capture is not active.".to_string())?;
    drop(active.stream);

    let raw_samples = {
        let mut guard = active
            .samples_mono_i16
            .lock()
            .map_err(|_| "Voice capture sample lock error.".to_string())?;
        std::mem::take(&mut *guard)
    };
    if raw_samples.is_empty() {
        return Err("No audio captured.".to_string());
    }

    let sample_rate_hz = NATIVE_VOICE_TARGET_SAMPLE_RATE_HZ;
    let samples =
        resample_linear_mono_i16(&raw_samples, active.input_sample_rate_hz, sample_rate_hz);
    if samples.is_empty() {
        return Err("No audio captured after resampling.".to_string());
    }

    let metrics = analyze_voice_signal(&samples);
    let speech_detected = detect_speech(&samples, sample_rate_hz, metrics);
    if !speech_detected {
        return Err(format!(
            "No speech detected. (rms={:.4}, peak={}, speech_ratio={:.3})",
            metrics.rms, metrics.peak, metrics.speech_ratio
        ));
    }

    let duration_ms = ((samples.len() as f64 / sample_rate_hz as f64) * 1000.0).round() as u64;
    let elapsed_ms = active.started_at.elapsed().as_millis() as u64;
    let audio_base64 = STANDARD.encode(encode_wav_pcm16_mono(&samples, sample_rate_hz));

    Ok(NativeVoiceCaptureStopped {
        audio_base64,
        mime_type: "audio/wav".to_string(),
        sample_rate_hz,
        duration_ms: duration_ms.max(elapsed_ms),
        rms: metrics.rms,
        peak: metrics.peak,
        speech_ratio: metrics.speech_ratio,
        speech_detected,
    })
}

fn native_voice_worker_loop(receiver: std::sync::mpsc::Receiver<NativeVoiceWorkerCommand>) {
    let mut session: Option<NativeVoiceCaptureSession> = None;
    while let Ok(command) = receiver.recv() {
        match command {
            NativeVoiceWorkerCommand::Start { reply } => {
                let _ = reply.send(start_native_capture_session(&mut session));
            }
            NativeVoiceWorkerCommand::Stop { reply } => {
                let _ = reply.send(stop_native_capture_session(&mut session));
            }
            NativeVoiceWorkerCommand::Cancel { reply } => {
                if let Some(active) = session.take() {
                    drop(active.stream);
                }
                let _ = reply.send(Ok(true));
            }
        }
    }
}

#[cfg(test)]
mod native_voice_capture_tests {
    use super::{
        f32_sample_to_i16, mix_frame_f32_to_i16, mix_frame_i16_to_i16, mix_frame_u16_to_i16,
    };

    #[test]
    fn f32_conversion_preserves_negative_polarity() {
        assert!(f32_sample_to_i16(-0.5) < 0);
        assert!(f32_sample_to_i16(0.5) > 0);
    }

    #[test]
    fn f32_mix_down_averages_channels() {
        let mixed = mix_frame_f32_to_i16(&[1.0, -1.0]);
        assert!(mixed.abs() <= 1);
    }

    #[test]
    fn i16_mix_down_averages_channels() {
        let mixed = mix_frame_i16_to_i16(&[2000, -1000, 1000]);
        assert_eq!(mixed, 667);
    }

    #[test]
    fn u16_mix_down_centers_at_32768() {
        assert_eq!(mix_frame_u16_to_i16(&[32768]), 0);
        let mixed = mix_frame_u16_to_i16(&[65535, 0]);
        assert!(mixed.abs() <= 1);
    }
}
