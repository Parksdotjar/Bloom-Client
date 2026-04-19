package blooms_kernel.mixin;

import net.minecraft.client.render.Camera;
import net.minecraft.util.math.Vec3d;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.gen.Invoker;

@Mixin(Camera.class)
public interface CameraAccessor {
    @Invoker("setRotation")
    void bloomsKernel$setRotation(float yaw, float pitch);

    @Invoker("setPos")
    void bloomsKernel$setPos(Vec3d pos);

    @Invoker("clipToSpace")
    float bloomsKernel$clipToSpace(float desiredCameraDistance);
}
