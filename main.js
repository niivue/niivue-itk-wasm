import { encode } from 'cbor-x'
import {
  iwm2mesh,
  iwi2nii,
  nii2iwi,
} from "@niivue/cbor-loader"
import {
  Niivue,
  NVMeshUtilities,
} from "@niivue/niivue"
import {
  downsampleBinShrink,
} from "@itk-wasm/downsample"
sliceDrop.onchange = function () {
  let st = parseInt(this.value)
  nv1.setSliceType(st)
}
function handleIntensityChange(data) {
  document.getElementById("intensity").innerHTML =
    "&nbsp;&nbsp;" + data.string
}
saveBtn.onclick = function () {
  nv1.saveImage({ filename: 'test.nii', isSaveDrawing: false, volumeByIndex: 0 })
}
// save mesh
saveMeshBtn.onclick = function () {
  NVMeshUtilities.saveMesh(nv1.meshes[0].pts, nv1.meshes[0].tris, 'cow.mz3', false)
}
let defaults = {
  backColor: [0, 0, 0, 1],
  show3Dcrosshair: true,
  onLocationChange: handleIntensityChange
}
var nv1 = new Niivue(defaults)
nv1.attachToCanvas(gl1)

async function doDownsample(inFile) {
  // bigint -> number is necessary for serialization because the object is serialized to JSON
  // to be sent to the worker and the JSON does not support bigint.
  // see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt#use_within_json
  inFile.size = inFile.size.map(Number)
  console.log('doing downsampling')
  console.log(inFile)
  const downSampleResult = await downsampleBinShrink(inFile, {
    shrinkFactors: [2, 2, 2],
    webWorker: null
  })
  const downSampledImage = downSampleResult.downsampled
  // number -> bigint because encode expects Image class to have bigint size
  downSampledImage.size = downSampledImage.size.map(BigInt)
  // must incode the downsampled image to cbor to work 
  // with iwi2nii implementation
  const downNii = iwi2nii(encode(downSampledImage))
  await nv1.loadVolumes([{ url: downNii, name: 'test.nii' }])
  console.log('dims after downsample')
  console.log(nv1.volumes[0].dims)
}

async function main() {
  // await loadIWI('./fslmean.iwi.cbor')
  // await loadIWM('./cow.iwm.cbor')
  // await createIWI()
  // await createIWM()

  nv1.useLoader(
    iwi2nii,
    'iwi.cbor',
    'nii'
  )

  // loader for iwm files
  nv1.useLoader(
    iwm2mesh,
    'iwm.cbor',
    'mz3'
  )

  await nv1.loadImages([
    { url: './fslmean.iwi.cbor', name: 'fslmean.iwi.cbor' },
    { url: './cow.iwm.cbor', name: 'cow.iwm.cbor' }
  ])

  // do downsample, but get ITK Image from niivue to show interoperability
  const volume = nv1.volumes[0]
  console.log(volume)
  const hdr = nv1.volumes[0].hdr
  const img = nv1.volumes[0].img
  console.log('hdr')
  console.log(hdr)
  console.log(hdr.dims)
  console.log('img')
  console.log(img)

  const iwi = nii2iwi(hdr, img, false)

  await doDownsample(iwi)

}
main()