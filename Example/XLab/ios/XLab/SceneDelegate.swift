import UIKit
import React_RCTAppDelegate

/** Creates the React Native window when UIKit connects XLab's application scene. */
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else {
      return
    }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window

    factory.startReactNative(
      withModuleName: "XLab",
      in: window,
      launchOptions: appDelegate.launchOptions
    )
  }

  func sceneDidDisconnect(_ scene: UIScene) {
    if let appDelegate = UIApplication.shared.delegate as? AppDelegate,
       appDelegate.window === window {
      appDelegate.window = nil
    }
    window = nil
  }
}
