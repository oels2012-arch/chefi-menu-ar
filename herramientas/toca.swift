// Prueba en la Mac de los archivos de AR para iPhone, con el mismo motor de Apple (RealityKit).
// Compilar:  swiftc -O herramientas/toca.swift -o /tmp/toca
// Uso: /tmp/toca <archivo.usdz> <carpeta de salida> <nombre de placa a tocar>...   ("-" = solo esperar)
//   p. ej. /tmp/toca modelos/variantes/hamburguesa_1010.usdz /tmp/fotos Placa_lechuga_1010 Placa_carne_0010
// La pantalla de la Mac debe estar encendida (caffeinate -u -d), si no, no toma fotos.
// Carga el USDZ en RealityKit (sin cámara), simula clics sobre las placas y guarda una foto tras cada uno.
import AppKit
import RealityKit

let args = CommandLine.arguments
let archivo = args[1], salida = args[2]
let toques = Array(args.dropFirst(3))

final class Delegado: NSObject, NSApplicationDelegate {
    var ventana: NSWindow!
    var vista: ARView!
    var raiz: Entity!
    func applicationDidFinishLaunching(_ n: Notification) {
        ventana = NSWindow(contentRect: NSRect(x: 80, y: 80, width: 900, height: 700), styleMask: [.titled], backing: .buffered, defer: false)
        vista = ARView(frame: NSRect(x: 0, y: 0, width: 900, height: 700))
        vista.environment.background = .color(.init(white: 0.92, alpha: 1))
        ventana.contentView = vista
        ventana.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        do { raiz = try Entity.load(contentsOf: URL(fileURLWithPath: archivo)) } catch { print("ERROR", error); exit(1) }
        let ancla = AnchorEntity(world: .zero)
        ancla.addChild(raiz)
        vista.scene.addAnchor(ancla)
        let camara = PerspectiveCamera()
        camara.camera.fieldOfViewInDegrees = 32
        let ojo = AnchorEntity(world: .zero)
        ojo.addChild(camara)
        camara.look(at: [0, 0.05, 0.08], from: [0.12, 0.34, 0.62], relativeTo: nil)
        vista.scene.addAnchor(ojo)
        Task { @MainActor in await self.correr() }
    }
    @MainActor func foto(_ nombre: String) async {
        await withCheckedContinuation { (c: CheckedContinuation<Void, Never>) in
            vista.snapshot(saveToHDR: false) { img in
                if let img, let tiff = img.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff), let png = rep.representation(using: .png, properties: [:]) {
                    try? png.write(to: URL(fileURLWithPath: "\(salida)/\(nombre).png"))
                } else { print("sin foto", nombre) }
                c.resume()
            }
        }
    }
    @MainActor func correr() async {
        try? await Task.sleep(nanoseconds: 2_500_000_000)
        await foto("0_inicio")
        for (i, nombre) in toques.enumerated() {
            if nombre != "-" {
                guard let e = raiz.findEntity(named: nombre) else { print("no existe", nombre); continue }
                let caja = e.visualBounds(relativeTo: nil)
                guard let p = vista.project(caja.center) else { print("fuera de vista", nombre); continue }
                // project() mide desde arriba; los eventos de AppKit, desde abajo.
                let punto = NSPoint(x: CGFloat(p.x), y: CGFloat(p.y))
                let enVentana = vista.convert(punto, to: nil)
                for tipo in [NSEvent.EventType.leftMouseDown, .leftMouseUp] {
                    if let ev = NSEvent.mouseEvent(with: tipo, location: enVentana, modifierFlags: [], timestamp: ProcessInfo.processInfo.systemUptime, windowNumber: ventana.windowNumber, context: nil, eventNumber: 0, clickCount: 1, pressure: 1) {
                        if tipo == .leftMouseDown { vista.mouseDown(with: ev) } else { vista.mouseUp(with: ev) }
                    }
                    try? await Task.sleep(nanoseconds: 60_000_000)
                }
                print("toque", nombre, "en", Int(p.x), Int(p.y))
            }
            try? await Task.sleep(nanoseconds: 1_600_000_000)
            await foto("\(i + 1)_\(nombre)")
        }
        exit(0)
    }
}
let app = NSApplication.shared
let d = Delegado()
app.delegate = d
app.setActivationPolicy(.accessory)
DispatchQueue.main.asyncAfter(deadline: .now() + 60) { print("TIEMPO AGOTADO"); exit(2) }
app.run()
