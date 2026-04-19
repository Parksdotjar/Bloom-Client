package blooms_kernel.mixin;

import blooms_kernel.SpeedTracker;
import net.minecraft.client.network.ClientPlayerEntity;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Unique;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(ClientPlayerEntity.class)
public abstract class ClientPlayerEntityMixin {
    @Unique
    private double bloomsKernel$lastX;
    @Unique
    private double bloomsKernel$lastZ;
    @Unique
    private boolean bloomsKernel$initialized;

    @Inject(method = "tick", at = @At("TAIL"))
    private void bloomsKernel$trackSpeed(CallbackInfo ci) {
        ClientPlayerEntity self = (ClientPlayerEntity) (Object) this;
        if (!bloomsKernel$initialized) {
            bloomsKernel$lastX = self.getX();
            bloomsKernel$lastZ = self.getZ();
            bloomsKernel$initialized = true;
            return;
        }
        double dx = self.getX() - bloomsKernel$lastX;
        double dz = self.getZ() - bloomsKernel$lastZ;
        double blocksPerTick = Math.sqrt((dx * dx) + (dz * dz));
        SpeedTracker.setBlocksPerSecond(blocksPerTick * 20.0D);
        bloomsKernel$lastX = self.getX();
        bloomsKernel$lastZ = self.getZ();
    }
}

