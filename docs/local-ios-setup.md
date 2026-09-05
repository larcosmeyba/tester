# Local iOS build setup

Notes from getting `expo run:ios` working on a Mac running macOS 26 with Xcode 26.6.
Most machines will not need any of this; it is written down because the path
through it was not obvious.

## The short version

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
brew install cocoapods            # if Homebrew works on your machine
pnpm install
pnpm --filter @helpthehive/mobile ios
```

If `brew install cocoapods` fails, read on.

## When Homebrew is blocked

Homebrew refuses to build anything when the Command Line Tools are older than the
OS:

```
Error: Your Command Line Tools (CLT) does not support macOS 26.
```

The fix is to reinstall them (this opens a GUI installer — click through it):

```bash
sudo rm -rf /Library/Developer/CommandLineTools && sudo xcode-select --install
```

Xcode's own toolchain is separate, so an in-flight `expo run:ios` is unaffected
by this.

## Installing CocoaPods without Homebrew

If you need CocoaPods before the CLT are fixed, it can be installed as a user gem
against the system Ruby. macOS ships Ruby 2.6, which is older than several of
CocoaPods' transitive dependencies expect, so each one has to be pinned to its
last 2.6-compatible release:

```bash
gem install ffi             --user-install --no-document -v 1.15.5
gem install securerandom    --user-install --no-document -v 0.3.2
gem install drb             --user-install --no-document -v 2.0.6
gem install connection_pool --user-install --no-document -v 2.5.5
gem install i18n            --user-install --no-document -v 1.14.8
gem install zeitwerk        --user-install --no-document -v 2.6.18
gem install activesupport   --user-install --no-document -v 6.1.7.10
gem install cocoapods       --user-install --no-document -v 1.15.2
```

Two gems then have to be removed, because newer versions of them shadow what
activesupport 6.1 expects on Ruby 2.6 and make `pod` fail with
`uninitialized constant ActiveSupport::LoggerThreadSafeLevel::Logger`:

```bash
gem uninstall logger -x --user-install
gem uninstall concurrent-ruby -v 1.3.8 -x --user-install --force   # leaves 1.3.4
```

Finally, `pod` only exists on the user gem path:

```bash
export PATH="$HOME/.gem/ruby/2.6.0/bin:$PATH"
export LANG=en_US.UTF-8      # CocoaPods warns without a UTF-8 locale
pod --version                # 1.15.2
```

**This arrangement is fragile.** Prefer fixing the Command Line Tools and
installing a modern Ruby (`brew install ruby` or rbenv), then installing
CocoaPods normally.

## Android

Android builds need the Android SDK, which is not part of Xcode. Install Android
Studio, then confirm:

```bash
adb --version
emulator -list-avds
```
