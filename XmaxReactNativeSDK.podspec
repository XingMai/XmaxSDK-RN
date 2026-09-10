require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
Pod::Spec.new do |s|
  s.name = 'XmaxReactNativeSDK'
  s.version = package['version']
  s.summary = package['description']
  s.homepage = 'https://xmax.cloud'
  s.license = { :type => 'Proprietary' }
  s.author = 'Xmax'
  s.source = { :path => '.' }
  s.platforms = { :ios => '15.1' }
  s.source_files = 'ios/**/*.{h,m,mm}'
  s.dependency 'VolcEngineRTC', '3.58.1.51400'
  s.frameworks = 'AVFoundation', 'UIKit', 'ImageIO'
  install_modules_dependencies(s)
end
