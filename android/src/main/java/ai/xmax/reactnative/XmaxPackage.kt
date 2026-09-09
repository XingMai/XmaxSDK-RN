package ai.xmax.reactnative
import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
class XmaxPackage : BaseReactPackage() {
  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? = if (name == XmaxRuntime.NAME) XmaxRuntime(context) else null
  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(XmaxRuntime.NAME to ReactModuleInfo(XmaxRuntime.NAME, XmaxRuntime.NAME, false, false, false, true))
  }
}
