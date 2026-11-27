# The SDK keeps images as images (SF18)

The images-only rule (J525) refused every SDK-built zone because the SDK itself still baked KTX2 into the product: a
world GLB's embedded images, a prop's colour texture and a scene's painted maps. The build now carries each as a PNG or
JPEG `image` file and the cook makes the KTX2. The encoders stay exported, deprecated, for the generators that still
call them until their zone's re-pack.
