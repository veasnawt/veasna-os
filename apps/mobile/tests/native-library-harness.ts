import { Directory, Filesystem } from "@capacitor/filesystem";
import { importLut, deleteLut, importCustomFont, deleteCustomFont, importCustomSfx, deleteCustomSfx } from "@veasnawt/vcut/src/api/client.ts";
import { nativeCreateProject, nativeDeleteProject, nativeLoadProject, nativeSaveProject, nativeLibraryFileUrl } from "@veasnawt/vcut/src/api/nativeStorage.ts";

/** Bundled into AppTests only, then evaluated inside the real Capacitor WKWebView. */
export async function run(): Promise<string[]> {
  const checks: string[] = [];
  const project = await nativeCreateProject("iOS library test");
  const id = project.bpProjectId;
  function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
  try {
    const cube = "LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1\n";
    const lut = await importLut(id, new File([cube], "identity.cube"));
    assert(lut.size === 2, "LUT size was lost");
    const lutUrl = nativeLibraryFileUrl(id, "lut", lut.relPath);
    try { assert(await (await fetch(lutUrl)).text() === cube, "LUT content was changed"); }
    catch (error) { throw new Error(`LUT URL cannot be read (${lutUrl}): ${error}`); }
    checks.push("LUT import and preview URL");
    let invalidRejected = false;
    try { await importLut(id, new File(["invalid"], "invalid.cube")); } catch { invalidRejected = true; }
    assert(invalidRejected, "Invalid LUT was accepted");
    const fontBytes = await (await fetch("/fonts/Battambang-Regular.ttf")).arrayBuffer();
    const font = await importCustomFont(id, new File([fontBytes], "Beta.ttf"));
    const face = await new FontFace(font.cssFamily, `url("${nativeLibraryFileUrl(id, "customFont", font.relPath)}")`).load();
    assert(face.status === "loaded", "Imported font could not be decoded");
    checks.push("Font import and WebKit decoding");
    invalidRejected = false;
    try { await importCustomFont(id, new File(["invalid"], "invalid.ttf")); } catch { invalidRejected = true; }
    assert(invalidRejected, "Invalid font was accepted");
    // A small PCM wave works offline and uses WebKit's actual media probe.
    const samples = 4410, wave = new ArrayBuffer(44 + samples * 2), view = new DataView(wave);
    const word = (offset: number, text: string) => [...text].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
    word(0, "RIFF"); view.setUint32(4, wave.byteLength - 8, true); word(8, "WAVE"); word(12, "fmt ");
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 44100, true); view.setUint32(28, 88200, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    word(36, "data"); view.setUint32(40, samples * 2, true);
    for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i * 440 * Math.PI * 2 / 44100) * 8000, true);
    const sound = await importCustomSfx(id, new File([wave], "Beta.wav", { type: "audio/wav" }));
    assert(sound.label === "Beta", "Sound label was lost");
    const savedWave = await (await fetch(nativeLibraryFileUrl(id, "customSfx", sound.relPath))).arrayBuffer();
    assert(savedWave.byteLength === wave.byteLength, "Imported sound cannot be read");
    checks.push("Sound import and preview URL");
    project.luts = [lut]; project.customFonts = [font]; project.customSfx = [sound];
    await nativeSaveProject(id, project);
    const reloaded = await nativeLoadProject(id);
    assert(reloaded.luts[0]?.id === lut.id && reloaded.customFonts[0]?.id === font.id && reloaded.customSfx[0]?.id === sound.id, "Libraries did not persist");
    checks.push("Library persistence");
    await deleteLut(id, lut.id, lut.relPath); await deleteCustomFont(id, font); await deleteCustomSfx(id, sound);
    // Repeating a deletion is safe, including through the actual native error code.
    await deleteLut(id, lut.id, lut.relPath); await deleteCustomFont(id, font); await deleteCustomSfx(id, sound);
    for (const folder of ["luts", "custom-fonts", "custom-sfx"]) {
      assert((await Filesystem.readdir({ path: `vcut-projects/${id}/${folder}`, directory: Directory.Data })).files.length === 0, "Deleted library file remains");
    }
    checks.push("Library deletion and invalid-file rejection");
    return checks;
  } finally { await nativeDeleteProject(id); }
}
