Pod::Spec.new do |s|
  s.name             = 'ffmpeg-kit-lgpl'
  s.version          = '8.1.2'
  s.summary          = 'FFmpegKit "full" package, non-GPL build (LGPL-3.0) for iOS'
  s.description      = <<-DESC
    Prebuilt FFmpegKit xcframeworks for iOS: FFmpeg plus dav1d/kvazaar/libvpx/
    libtheora/etc, WITHOUT the GPL-only libx264/libfdk-aac encoders. H.264 and
    H.265 encoding go through Apple's own hardware encoders instead
    (h264_videotoolbox/hevc_videotoolbox, confirmed present in this build) —
    chosen over the "full-gpl" variant specifically so App Store/TestFlight
    distribution doesn't carry GPLv3's linking obligations.

    Binaries come from sk3llo/ffmpeg_kit_flutter's own maintained releases —
    the original arthenica/ffmpeg-kit project retired in 2025 and its release
    assets are gone, same reason the Android side needs a community fork too.
  DESC
  s.homepage         = 'https://github.com/sk3llo/ffmpeg_kit_flutter'
  s.license          = { :type => 'LGPL-3.0' }
  s.author           = { 'ARTHENICA (binaries), sk3llo (maintenance fork)' => 'https://github.com/sk3llo/ffmpeg_kit_flutter' }

  s.platform            = :ios, '14.0'
  s.static_framework    = true

  s.source              = { :path => '.' }
  s.prepare_command     = <<-CMD
    chmod +x setup_ios.sh
    ./setup_ios.sh
  CMD

  s.vendored_frameworks = 'Frameworks/ffmpegkit.xcframework',
                           'Frameworks/libavcodec.xcframework',
                           'Frameworks/libavdevice.xcframework',
                           'Frameworks/libavfilter.xcframework',
                           'Frameworks/libavformat.xcframework',
                           'Frameworks/libavutil.xcframework',
                           'Frameworks/libswresample.xcframework',
                           'Frameworks/libswscale.xcframework'
  s.ios.frameworks      = 'AudioToolbox', 'AVFoundation', 'CoreMedia', 'VideoToolbox'
  s.libraries            = 'z', 'bz2', 'c++', 'iconv'
end
