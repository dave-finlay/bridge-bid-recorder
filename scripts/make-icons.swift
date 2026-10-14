// Draws the app icons: a white spade on baize green. Run from the project
// folder with `npm run icons`; it writes icons/icon-<size>.png.
// iOS rounds the corners itself, so the icons are plain squares.

import AppKit

let green = NSColor(srgbRed: 0x1d / 255, green: 0x6b / 255, blue: 0x41 / 255, alpha: 1)

for size in [180, 192, 512] {
    let rep = NSBitmapImageRep(
        bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)

    let side = CGFloat(size)
    green.setFill()
    NSRect(x: 0, y: 0, width: side, height: side).fill()

    // U+FE0E asks for the text form of the spade, not the emoji.
    let spade = "\u{2660}\u{FE0E}" as NSString
    let attributes: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: side * 0.66),
        .foregroundColor: NSColor.white,
    ]
    let glyph = spade.size(withAttributes: attributes)
    spade.draw(
        at: NSPoint(x: (side - glyph.width) / 2, y: (side - glyph.height) / 2 + side * 0.02),
        withAttributes: attributes)

    NSGraphicsContext.restoreGraphicsState()
    let png = rep.representation(using: .png, properties: [:])!
    try! png.write(to: URL(fileURLWithPath: "icons/icon-\(size).png"))
    print("icons/icon-\(size).png")
}
