import { Controller, Get } from '@nestjs/common';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';

@Controller('v1/test')
export class TestController {
  @Get('protected')
  // No @Public() decorator means this route is protected
  getProtected() {
    return { message: 'This is protected data!' };
  }
  
  @Public()
  @Get('public')
  getPublic() {
    return { message: 'This is public data!' };
  }
  
  @Roles('admin')
  @Get('admin')
  getAdminOnly() {
    return { message: 'This is admin only data!' };
  }
}