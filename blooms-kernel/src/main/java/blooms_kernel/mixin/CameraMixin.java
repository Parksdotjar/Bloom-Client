package blooms_kernel.mixin;

import blooms_kernel.VisualsController;
import net.minecraft.client.MinecraftClient;
import net.minecraft.client.render.Camera;
import net.minecraft.entity.Entity;
import net.minecraft.util.math.MathHelper;
import net.minecraft.util.math.Vec3d;
import net.minecraft.world.World;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(Camera.class)
public abstract class CameraMixin {
    @Inject(method = "update", at = @At("TAIL"))
    private void bloomsKernel$freeLookCamera(World world, Entity focusedEntity, boolean thirdPerson, boolean inverseView, float tickProgress, CallbackInfo ci) {
        MinecraftClient client = MinecraftClient.getInstance();
        if (!VisualsController.isFreeLookActive(client) || focusedEntity == null) {
            return;
        }
        float yaw = focusedEntity.getYaw(tickProgress) + VisualsController.getFreeLookYawOffset();
        float pitch = MathHelper.clamp(focusedEntity.getPitch(tickProgress) + VisualsController.getFreeLookPitchOffset(), -89.9F, 89.9F);
        CameraAccessor accessor = (CameraAccessor) this;
        accessor.bloomsKernel$setRotation(yaw, pitch);

        Vec3d pivot = focusedEntity.getCameraPosVec(tickProgress);
        float clippedDistance = accessor.bloomsKernel$clipToSpace(4.0F);
        double yawRad = Math.toRadians(yaw);
        double pitchRad = Math.toRadians(pitch);
        Vec3d forward = new Vec3d(
            -Math.sin(yawRad) * Math.cos(pitchRad),
            -Math.sin(pitchRad),
            Math.cos(yawRad) * Math.cos(pitchRad)
        );
        Vec3d orbitPos = pivot.subtract(forward.multiply(clippedDistance));
        accessor.bloomsKernel$setPos(orbitPos);
    }
}
