import PageHead from '@/components/page-head.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCookie } from 'react-use';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import WaveLayout from '@/layouts/wave-layout';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  revokeToken,
  getUserTokens,
  type User,
  type Token,
  createToken,
  updateUser
} from '@/api/auth';
import { UAParser } from 'ua-parser-js';
import { UserContext } from '@/providers/user-provider.js';
import { format, set } from 'date-fns';
import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';
import useSWR from 'swr';
import { toast } from '@/hooks/use-toast.js';
import { parseError } from '@/lib/error.js';
import { Label } from '@/components/ui/label.js';
import { Input } from '@/components/ui/input.js';
import { Turnstile } from '@marsidev/react-turnstile';
import { TURNSTILE_SITE_ID } from '@/config.js';
import useSWRMutation from 'swr/mutation';

function UALabel({ userAgent }: { userAgent: string }) {
  const getBrowserIconName = (browser: string) => {
    if (!browser) return 'i-solar:question-square-line-duotone';
    if (browser.indexOf('Chrome') > -1) return 'i-simple-icons:googlechrome';
    if (browser.indexOf('Firefox') > -1) return 'i-simple-icons:firefoxbrowser';
    if (browser.indexOf('Safari') > -1) return 'i-simple-icons:safari';
    if (browser.indexOf('Edge') > -1) return 'i-simple-icons:microsoftedge';
    if (browser.indexOf('IE') > -1) return 'i-simple-icons:internetexplorer';
    if (browser.indexOf('Opera') > -1) return 'i-simple-icons:opera';
    if (browser.indexOf('Arc') > -1) return 'i-simple-icons:arc';
    if (browser.indexOf('WeChat') > -1) return 'i-simple-icons:wechat';
    return 'i-solar:question-square-line-duotone';
  };
  const getOSIconName = (os: string) => {
    if (!os) return 'i-solar:question-square-line-duotone';
    if (os.indexOf('Windows') > -1) return 'i-simple-icons:windows10';
    if (os.indexOf('Android') > -1) return 'simple-icons:android';
    if (os.indexOf('mac') > -1) return 'i-simple-icons:apple';
    if (os.indexOf('Harmony') > -1) return 'simple-icons:huawei';
    if (os.indexOf('Chrome') > -1) return 'i-simple-icons:googlechrome';
    if (os.indexOf('iOS') > -1) return 'simple-icons:ios';
    return 'i-simple-icons:linux';
  };
  const ua = new UAParser(userAgent);
  const browser = ua.getBrowser();
  const os = ua.getOS();
  return (
    <div className="color-foreground flex items-center gap-1">
      <div className={getBrowserIconName(browser.name)} />
      {browser ? browser.major : 'Unk'}
      <div className={cn('ml-1', os ? getOSIconName(os.name) : '')} />
      {os ? os.version : 'own'}
    </div>
  );
}

function TokenLabel({ token }: { token: Token }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-2">
        <div className="i-material-symbols:alarm-off-rounded" />
        {format(new Date(token.expires), 'MM-dd HH:mm:ss')}
      </div>
      {token.user_agent && (
        <UALabel userAgent={token.user_agent} key={token._id} />
      )}
      {token.request_ip && (
        <div className="flex items-center gap-2">
          <div className="i-iconoir:ip-address-tag" />
          {token.request_ip.length < 20
            ? token.request_ip
            : token.request_ip.substring(0, 17) + '...'}
        </div>
      )}
    </div>
  );
}

function TokenPopover({ onDelete, variant = 'session' }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="secondary" onClick={() => setOpen(!open)}>
          <div className="i-solar:trash-bin-2-bold-duotone size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-60">
        <CardTitle className="mb-2">
          {variant == 'session' ? 'Terminate Session' : 'Revoke Key'}
        </CardTitle>
        <CardDescription className="mb-2">
          {variant == 'session'
            ? 'Users on this session will be logged out immediately.'
            : 'This key will be revoked and can not be recovered.'}
        </CardDescription>
        <div className="mt-2 flex justify-between gap-3">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            className="w-full"
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full"
          >
            {variant == 'session' ? 'Terminate' : 'Revoke'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SessionsPanel() {
  const {
    data: sessionTokens,
    isLoading,
    error,
    mutate
  } = useSWR(
    '/auth/token?token_type=session',
    async () => {
      let r = await getUserTokens('session');
      r.sort((a, b) => a.expires - b.expires);
      return r;
    },
    {
      suspense: true,
      keepPreviousData: true
    }
  );

  const [tokenInCookie] = useCookie('token');

  const revokeSession = async (sessionId) => {
    // Make the API call
    let oldTokens = sessionTokens;
    try {
      mutate(
        sessionTokens.filter((session) => session._id !== sessionId),
        false // Don't revalidate immediately
      );
      await revokeToken(sessionId);
      // Revalidate to make sure our optimistic update was correct
      mutate();
    } catch (error) {
      toast(parseError(error));
      mutate(oldTokens);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-30">Device</TableHead>
          <TableHead className="w-30">Expires</TableHead>
          <TableHead className="w-40">IP Address</TableHead>
          <TableHead className="w-24 text-center">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessionTokens &&
          sessionTokens.map((token) => {
            return (
              <TableRow
                key={token._id}
                className={cn(
                  'h-[52px]',
                  tokenInCookie == token._id ? 'bg-green-1 dark:bg-green-7' : ''
                )}
              >
                <TableCell className="w-30 max-w-30 truncate">
                  <UALabel userAgent={token.user_agent} />
                </TableCell>
                <TableCell className="w-30 max-w-30 truncate">
                  {format(new Date(token.expires), 'MM-dd HH:mm:ss')}
                </TableCell>
                <TableCell className="w-40 max-w-40 truncate">
                  {token.request_ip}
                </TableCell>
                <TableCell className="w-8 text-center">
                  {tokenInCookie == token._id ? (
                    <div> Current </div>
                  ) : (
                    <TokenPopover onDelete={() => revokeSession(token._id)} />
                  )}
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
      {sessionTokens.length == 0 && (
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4} className="h-[52px]">
              😅No other sessions.
            </TableCell>
          </TableRow>
        </TableFooter>
      )}
    </Table>
  );
}

function APIKeyCreatePopover({ onCreate }) {
  const [turnstileToken, setTurnstileToken] = useState('');
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="flex w-[80px] items-center gap-[2px]"
        >
          {/* <div className="i-solar:add-square-bold-duotone mt-[2px] size-4" />
          +1 */}
          Create
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full">
        <div className="flex flex-col gap-4">
          <div className="flex w-full items-center">
            <Label htmlFor="name" className="w-15">
              Name
            </Label>
            <Input
              id="name"
              placeholder="Optional"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex h-[65px] w-[300px] items-center justify-center">
            <Turnstile
              siteKey={TURNSTILE_SITE_ID}
              onSuccess={setTurnstileToken}
              onExpire={() => setTurnstileToken('')}
              className="h-[65px] w-[300px]"
            />
          </div>
          <Button
            className="w-[300px]"
            onClick={async () => {
              if (await onCreate(turnstileToken, name)) setOpen(false);
            }}
          >
            Create API Key
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function APIKeysPanel() {
  const {
    data: APITokens,
    isLoading,
    error,
    mutate
  } = useSWR(
    '/auth/token?token_type=api',
    async () => {
      let r = await getUserTokens('api');
      r.sort((a, b) => a.expires - b.expires);
      return r;
    },
    {
      suspense: true,
      keepPreviousData: true
    }
  );
  const revokeAPIToken = async (tokenId) => {
    // Make the API call
    let oldTokens = APITokens;
    try {
      await mutate(
        APITokens.filter((session) => session._id !== tokenId),
        false // Don't revalidate immediately
      );
      await revokeToken(tokenId);
      // Revalidate to make sure our optimistic update was correct
      await mutate();
    } catch (error) {
      toast(parseError(error));
      await mutate(oldTokens);
    }
  };
  const createAPIToken = async (turnstileToken, name) => {
    if (!turnstileToken) {
      toast({
        title: 'Captcha Error',
        description: 'Please verify you are not a robot',
        variant: 'destructive'
      });
      return false;
    }
    await createToken(turnstileToken, name);
    await mutate();
    return true;
  };
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(
      function () {
        toast({
          title: 'Copied',
          description: 'API Key copied to clipboard'
        });
      },
      function (err) {
        toast({
          title: 'Copy Error',
          description: 'Failed to copy API Key to clipboard',
          variant: 'destructive'
        });
      }
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-30">Name</TableHead>
          <TableHead className="w-30">Expires</TableHead>
          <TableHead className="w-40">Key</TableHead>
          <TableHead className="w-24 text-center">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {APITokens &&
          APITokens.map((token) => {
            return (
              <TableRow key={token._id}>
                <TableCell className="w-30 max-w-30 truncate">
                  {token.name ? token.name : 'Untitled'}
                </TableCell>
                <TableCell className="w-30 max-w-30 truncate">
                  {format(new Date(token.expires), 'MM-dd HH:mm:ss')}
                </TableCell>
                <TableCell className="w-40 max-w-40 truncate">
                  {token._id.substring(0, 10) + '...'}
                </TableCell>
                <TableCell className="flex gap-2 text-center">
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={() => copyToClipboard(token._id)}
                  >
                    <div className="i-solar:copy-bold-duotone size-4" />
                  </Button>
                  <TokenPopover
                    onDelete={() => revokeAPIToken(token._id)}
                    variant="api"
                  />
                </TableCell>
              </TableRow>
            );
          })}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>👉 Need a new API Key?</TableCell>
          <TableCell className="w-8 text-center">
            <APIKeyCreatePopover onCreate={createAPIToken} />
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  );
}

function UserInfoArea() {
  const { user, setUser } = useContext(UserContext);
  const [openEdit, setOpenEdit] = useState(false);
  const [username, setUsername] = useState(user?.name || '');
  const [openLogout, setOpenLogout] = useState(false);

  const {
    trigger: doUpdateUser,
    isMutating,
    data
  } = useSWRMutation('/api/user', (url, { arg }: { arg: string }) =>
    updateUser(arg)
  );

  const [tokenInCookie] = useCookie('token');

  const { trigger: doLogout, isMutating: isLogoutMutating } = useSWRMutation(
    '/api/user',
    async (url, { arg }) => await revokeToken(tokenInCookie)
  );

  // set Username on mount
  useEffect(() => {
    setUsername(user?.name || '');
  }, [user]);

  return (
    <div className="flex items-center gap-2">
      <Popover open={openEdit} onOpenChange={setOpenEdit}>
        <PopoverTrigger asChild>
          <Button variant="outline">
            <div className="i-solar:pen-2-bold-duotone mr-1" />
            Edit
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-60 flex-col gap-3 p-4">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isMutating}
          />
          <Button
            onClick={async () => {
              const r = await doUpdateUser(username);
              setUser(r);
              setUsername(r?.name || '');
              setOpenEdit(false);
            }}
            className="px-5"
            disabled={isMutating}
          >
            Submit
          </Button>
        </PopoverContent>
      </Popover>
      <Popover open={openLogout} onOpenChange={setOpenLogout}>
        <PopoverTrigger asChild>
          <Button>
            <div className="i-solar:exit-bold-duotone mr-1" />
            Logout
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-60 flex-col gap-3 p-4">
          <CardTitle className="mb-2 text-center font-normal">
            Are you sure to log out?
          </CardTitle>
          <div className="flex justify-between gap-3">
            <Button
              onClick={() => setOpenLogout(false)}
              className="w-full"
              disabled={isMutating}
              variant="outline"
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                await doLogout();
                // clean up the user
                setUser(null);
                // redirect to home page
                window.location.href = '/';
              }}
              className="w-full"
              disabled={isLogoutMutating}
              variant="destructive"
            >
              Logout
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function DashboardPage() {
  const { user, setUser } = useContext(UserContext);

  return (
    <WaveLayout>
      <div className="max-h-screen flex-1 space-y-4 overflow-y-auto p-4 pt-6 md:p-8">
        <div className="flex items-center justify-between space-y-2">
          <h2 className="text-3xl font-bold tracking-tight">
            Hi, {user?.name}! 👋
          </h2>
        </div>
        <Tabs defaultValue="apikeys" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="apikeys">API Keys</TabsTrigger>
              <TabsTrigger value="sessions">Sessions</TabsTrigger>
            </TabsList>
            <UserInfoArea />
          </div>
          <TabsContent value="apikeys" className="space-y-4">
            <APIKeysPanel />
          </TabsContent>
          <TabsContent value="sessions" className="space-y-4">
            <SessionsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </WaveLayout>
  );
}
